import * as quotesCore from '@pkg/core';
import { hasPermission } from '@pkg/domain';
import {
  AuthId,
  type AuthId as AuthIdType,
  QuoteCreateInput as CoreQuoteCreateInput,
  type QuoteCreateInput as CoreQuoteCreateInputType,
  CustomerCompanyName,
  CustomerEmail,
  CustomerOptionalText,
  DateIsoString,
  DateOnlyIsoString,
  Price,
  ProductBay,
  QuoteDepositPercent,
  QuoteDetail,
  QuoteDiscountPercent,
  QuoteDocumentNotes,
  QuoteLineItemName,
  QuoteLineItemQuantity,
  QuoteNotes,
  QuoteProductDetailFacts,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  QuoteWorkTitle,
  type UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAiV2ActorId } from '@/v2/actor.js';
import type { AiV2Context } from '@/v2/context.js';
import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createQuoteAppHref,
  InternalAppHref,
} from '@/v2/entity-links.js';

const CreateQuoteCustomerInput = z.discriminatedUnion('type', [
  z.object({ customerId: UUID, type: z.literal('existing') }).strict(),
  z
    .object({
      address: CustomerOptionalText.default(null),
      companyName: CustomerCompanyName,
      contactPerson: CustomerOptionalText.default(null),
      email: CustomerEmail.nullable().default(null),
      phone: CustomerOptionalText.default(null),
      type: z.literal('inline'),
    })
    .strict(),
]);

const CreateQuoteOfferingInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('product'), productId: UUID }).strict(),
  z.object({ basePrice: Price, kind: z.literal('custom'), workTitle: QuoteWorkTitle }).strict(),
]);

const CreateQuoteLineItemInput = z
  .object({
    name: QuoteLineItemName,
    quantity: QuoteLineItemQuantity.default(1),
    unitPrice: Price,
  })
  .strict();

// Provider tool schemas are JSON-only, so compose non-transforming schema leaves and normalize in the mapper.
export type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;
export const CreateQuoteInput = z
  .object({
    customer: CreateQuoteCustomerInput.describe(
      'Use an existing Customer UUID from findCustomers, or inline Customer details to create one with the Quote.',
    ),
    deliveryIncluded: z.boolean().default(true),
    deliveryPrice: Price.default(0),
    depositPercent: QuoteDepositPercent.default(0),
    discountPercent: QuoteDiscountPercent.default(0),
    documentNotes: QuoteDocumentNotes.default(null),
    lineItems: z.array(CreateQuoteLineItemInput).default([]),
    notes: QuoteNotes.default(null),
    offering: CreateQuoteOfferingInput.describe(
      'A Product offering requires a Product UUID from findProducts. A Custom offering requires a Work Title and base price.',
    ),
    plannedDeliveryDate: DateOnlyIsoString.nullable().default(null),
    preferredDeliveryDate: DateOnlyIsoString.nullable().default(null),
    salesPersonId: AuthId.optional().describe(
      'Optional salesperson User ID. Omit to assign the acting user; set only when the user explicitly requests another salesperson.',
    ),
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput).default([]),
    status: QuoteStatus.default('draft'),
    validUntil: DateIsoString.nullable().default(null),
  })
  .strict();

const QuoteLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  job: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
});

const CreateQuoteProductBay = ProductBay.pick({ defaultWorkingDays: true }).extend({
  bay: ProductBay.shape.bay.pick({ department: true, id: true, name: true }),
});

const CreateQuoteProduct = QuoteProductDetailFacts.omit({ bays: true, thumbnailDataUrl: true }).extend({
  bays: z.array(CreateQuoteProductBay),
});

const CreateProductQuoteResponse = QuoteDetail.options[0]
  .omit({ customerThumbnailDataUrl: true, product: true, salesPersonThumbnailDataUrl: true })
  .extend({ links: QuoteLinks, product: CreateQuoteProduct });

const CreateCustomQuoteResponse = QuoteDetail.options[1]
  .omit({ customerThumbnailDataUrl: true, product: true, salesPersonThumbnailDataUrl: true })
  .extend({ links: QuoteLinks, product: z.null() });

export type CreateQuoteResponse = z.infer<typeof CreateQuoteResponse>;
export const CreateQuoteResponse = z.discriminatedUnion('kind', [
  CreateProductQuoteResponse,
  CreateCustomQuoteResponse,
]);

export function toCoreQuoteCreateInput(input: CreateQuoteInput, actorUserId: AuthIdType): CoreQuoteCreateInputType {
  return CoreQuoteCreateInput.parse({
    ...input,
    salesPersonId: input.salesPersonId ?? actorUserId,
  });
}

export function toCreateQuoteResponse(quote: QuoteDetail, access: UserAccessSummary | null): CreateQuoteResponse {
  return CreateQuoteResponse.parse({
    ...quote,
    links: {
      app: createQuoteAppHref(quote.id),
      ...(hasPermission(access, 'customer:read') ? { customer: createCustomerAppHref(quote.customerId) } : {}),
      ...(quote.job && hasPermission(access, 'job:read') ? { job: createJobAppHref(quote.job.jobId) } : {}),
      ...(quote.productId && hasPermission(access, 'product:read')
        ? { product: createProductAppHref(quote.productId) }
        : {}),
    },
  });
}

export const createQuoteDefinition = {
  name: 'createQuote',
  description: [
    'Create one Product Quote or Custom Quote when the user explicitly asks for it.',
    'Use findProducts to resolve a Product Quote productId and findCustomers to resolve an existing Customer; use an inline Customer when the company is new.',
    'Omit salesPersonId to assign the acting user. Do not choose another salesperson unless the user explicitly requests it.',
    'Returns the created Quote details and permission-safe relationship links without thumbnail data.',
  ].join('\n'),
  inputSchema: CreateQuoteInput,
  outputSchema: CreateQuoteResponse,
  requiredPermission: ['quote:create'],
  async handler(args: unknown, ctx: AiV2Context): Promise<CreateQuoteResponse> {
    const actorUserId = requireAiV2ActorId(ctx);
    const input = toCoreQuoteCreateInput(CreateQuoteInput.parse(args), actorUserId);
    const quote = await quotesCore.createQuote({ actorUserId, db: ctx.db, input });
    return toCreateQuoteResponse(quote, ctx.access);
  },
} as const;
