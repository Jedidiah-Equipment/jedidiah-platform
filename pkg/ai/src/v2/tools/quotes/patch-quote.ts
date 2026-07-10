import * as quotesCore from '@pkg/core';
import { hasPermission } from '@pkg/domain';
import {
  AuthId,
  QuotePatchInput as CoreQuotePatchInput,
  type QuotePatchInput as CoreQuotePatchInputType,
  DateIsoString,
  DateOnlyIsoString,
  Price,
  ProductBay,
  QuoteDetail,
  QuoteDocumentNotes,
  QuoteLineItemName,
  QuoteLineItemQuantity,
  QuoteNotes,
  QuoteProductDetailFacts,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
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

const PatchQuoteLineItemInput = z
  .object({
    name: QuoteLineItemName,
    quantity: QuoteLineItemQuantity.default(1),
    unitPrice: Price,
  })
  .strict();

// Provider tool schemas are JSON-only, so compose non-transforming schema leaves and normalize in the mapper.
export type PatchQuoteInput = z.infer<typeof PatchQuoteInput>;
export const PatchQuoteInput = z
  .object({
    documentNotes: QuoteDocumentNotes.optional(),
    id: UUID,
    lineItems: z
      .array(PatchQuoteLineItemInput)
      .optional()
      .describe('Complete replacement list. Omit to keep all current Quote Line Items; use [] to clear them.'),
    notes: QuoteNotes.optional(),
    plannedDeliveryDate: DateOnlyIsoString.nullable().optional(),
    preferredDeliveryDate: DateOnlyIsoString.nullable().optional(),
    salesPersonId: AuthId.optional(),
    selectedAssemblies: z
      .array(QuoteSelectedAssemblyInput)
      .optional()
      .describe('Complete replacement selection. Omit to keep current assemblies; use [] to clear them.'),
    status: QuoteStatus.optional(),
    validUntil: DateIsoString.nullable().optional(),
  })
  .strict();

const QuoteLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  job: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
});

const PatchQuoteProductBay = ProductBay.pick({ defaultWorkingDays: true }).extend({
  bay: ProductBay.shape.bay.pick({ department: true, id: true, name: true }),
});

const PatchQuoteProduct = QuoteProductDetailFacts.omit({ bays: true, thumbnailDataUrl: true }).extend({
  bays: z.array(PatchQuoteProductBay),
});

const PatchProductQuoteResponse = QuoteDetail.options[0]
  .omit({ customerThumbnailDataUrl: true, product: true, salesPersonThumbnailDataUrl: true })
  .extend({ links: QuoteLinks, product: PatchQuoteProduct });

const PatchCustomQuoteResponse = QuoteDetail.options[1]
  .omit({ customerThumbnailDataUrl: true, product: true, salesPersonThumbnailDataUrl: true })
  .extend({ links: QuoteLinks, product: z.null() });

export type PatchQuoteResponse = z.infer<typeof PatchQuoteResponse>;
export const PatchQuoteResponse = z.discriminatedUnion('kind', [PatchProductQuoteResponse, PatchCustomQuoteResponse]);

export function toCoreQuotePatchInput(input: PatchQuoteInput): CoreQuotePatchInputType {
  return CoreQuotePatchInput.parse(input);
}

export function toPatchQuoteResponse(quote: QuoteDetail, access: UserAccessSummary | null): PatchQuoteResponse {
  return PatchQuoteResponse.parse({
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

export const patchQuoteDefinition = {
  name: 'patchQuote',
  description: [
    'Patch one Quote, changing only explicitly provided fields: status, salesperson, delivery dates, valid-until, notes, line items, or selected assemblies.',
    'Use findQuotes first when the Quote UUID is not already known.',
    'Do not change status to accepted or rejected unless the user explicitly requested that exact decision.',
    'When lineItems or selectedAssemblies are provided, they replace the complete collection; use getQuote first to preserve entries the user did not ask to remove.',
    'Offering and quote-level pricing fields remain excluded and must be edited in the Quote form.',
    'Omitted fields remain unchanged; null clears a nullable date or note.',
  ].join('\n'),
  inputSchema: PatchQuoteInput,
  outputSchema: PatchQuoteResponse,
  requiredPermission: ['quote:update'],
  async handler(args: unknown, ctx: AiV2Context): Promise<PatchQuoteResponse> {
    const input = toCoreQuotePatchInput(PatchQuoteInput.parse(args));
    const quote = await quotesCore.patchQuote({
      actorUserId: requireAiV2ActorId(ctx),
      db: ctx.db,
      input,
    });
    return toPatchQuoteResponse(quote, ctx.access);
  },
} as const;
