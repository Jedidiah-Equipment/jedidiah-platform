import * as quotesCore from '@pkg/core';
import { hasPermission } from '@pkg/domain';
import { ProductBay, QuoteDetail, QuoteProductDetailFacts, type UserAccessSummary, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';
import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createQuoteAppHref,
  InternalAppHref,
} from '@/v2/entity-links.js';

export type GetQuoteInput = z.infer<typeof GetQuoteInput>;
export const GetQuoteInput = z.object({ id: UUID }).strict();

const QuoteLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  job: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
});

const GetQuoteProductBay = ProductBay.pick({ defaultWorkingDays: true }).extend({
  bay: ProductBay.shape.bay.pick({ department: true, id: true, name: true }),
});

const GetQuoteProduct = QuoteProductDetailFacts.omit({ bays: true, thumbnailDataUrl: true }).extend({
  bays: z.array(GetQuoteProductBay),
});

const GetProductQuote = QuoteDetail.options[0]
  .omit({ customerThumbnailDataUrl: true, product: true, salesPersonThumbnailDataUrl: true })
  .extend({ links: QuoteLinks, product: GetQuoteProduct });

const GetCustomQuote = QuoteDetail.options[1]
  .omit({ customerThumbnailDataUrl: true, product: true, salesPersonThumbnailDataUrl: true })
  .extend({ links: QuoteLinks, product: z.null() });

export type GetQuoteResponse = z.infer<typeof GetQuoteResponse>;
export const GetQuoteResponse = z.discriminatedUnion('kind', [GetProductQuote, GetCustomQuote]);

export function toGetQuoteResponse(quote: QuoteDetail, access: UserAccessSummary | null): GetQuoteResponse {
  return GetQuoteResponse.parse({
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

export const getQuoteDefinition = {
  name: 'getQuote',
  description: [
    'Get the full details for one Product Quote or Custom Quote by UUID.',
    'Use after findQuotes identifies the Quote the user means.',
    'Returns pricing, status, dates, Customer and offering details, line items, selected assemblies, and relationship links without thumbnail data.',
  ].join('\n'),
  inputSchema: GetQuoteInput,
  outputSchema: GetQuoteResponse,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiV2Context): Promise<GetQuoteResponse> {
    const input = GetQuoteInput.parse(args);
    const quote = await quotesCore.getQuote({ db: ctx.db, id: input.id });
    return toGetQuoteResponse(quote, ctx.access);
  },
} as const;
