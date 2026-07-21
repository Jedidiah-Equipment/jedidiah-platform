import * as quotesCore from '@pkg/core';
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
  QuoteDepositPercent,
  type QuoteDetail,
  QuoteDiscountPercent,
  QuoteDocumentNotes,
  QuoteNotes,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  QuoteWorkTitle,
  type UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAiActorId } from '@/actor.js';
import type { AiContext } from '@/context.js';
import {
  QuoteDetailResponse as SharedQuoteDetailResponse,
  type QuoteDetailResponse as SharedQuoteDetailResponseType,
  toQuoteDetailResponse,
} from '@/tools/quotes/quote-response.js';

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

// Provider tool schemas are JSON-only, so compose non-transforming schema leaves and normalize in the mapper.
export type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;
export const CreateQuoteInput = z
  .object({
    customer: CreateQuoteCustomerInput.describe(
      'Use an existing Customer UUID from findCustomers, or inline Customer details to create one with the Quote.',
    ),
    deliveryIncluded: z
      .boolean()
      .default(true)
      .describe('Whether delivery is already included in the sale price. Set false for an additional charge.'),
    deliveryPrice: Price.default(0).describe(
      'The additional delivery charge. Must be zero when deliveryIncluded is true.',
    ),
    depositPercent: QuoteDepositPercent.default(0),
    discountPercent: QuoteDiscountPercent.default(0),
    documentNotes: QuoteDocumentNotes.default(null),
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

export type CreateQuoteResponse = SharedQuoteDetailResponseType;
export const CreateQuoteResponse = SharedQuoteDetailResponse;

export function toCoreQuoteCreateInput(input: CreateQuoteInput, actorUserId: AuthIdType): CoreQuoteCreateInputType {
  return CoreQuoteCreateInput.parse({
    ...input,
    salesPersonId: input.salesPersonId ?? actorUserId,
  });
}

export function toCreateQuoteResponse(quote: QuoteDetail, access: UserAccessSummary | null): CreateQuoteResponse {
  return toQuoteDetailResponse(quote, access);
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
  anyOfPermissions: ['quote:create'],
  async handler(args: unknown, ctx: AiContext): Promise<CreateQuoteResponse> {
    const actorUserId = requireAiActorId(ctx);
    const input = toCoreQuoteCreateInput(CreateQuoteInput.parse(args), actorUserId);
    const quote = await quotesCore.createQuote({ actorUserId, db: ctx.db, input });
    return toCreateQuoteResponse(quote, ctx.access);
  },
} as const;
