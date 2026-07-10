import * as quotesCore from '@pkg/core';
import { hasPermission } from '@pkg/domain';
import {
  QuoteListInput,
  type QuoteListResult,
  QuoteProductSummaryFacts,
  QuoteSummary,
  type UserAccessSummary,
} from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';
import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createQuoteAppHref,
  InternalAppHref,
} from '@/v2/entity-links.js';

export type FindQuotesInput = z.infer<typeof FindQuotesInput>;
export const FindQuotesInput = QuoteListInput.pick({ search: true }).strict();

const QuoteLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  job: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
});

const FindProductQuote = QuoteSummary.options[0]
  .pick({
    code: true,
    createdAt: true,
    customerCompanyName: true,
    customerId: true,
    id: true,
    job: true,
    kind: true,
    plannedDeliveryDate: true,
    productId: true,
    quotedBasePrice: true,
    quotedCurrencyCode: true,
    status: true,
    workTitle: true,
  })
  .extend({ links: QuoteLinks, product: QuoteProductSummaryFacts });

const FindCustomQuote = QuoteSummary.options[1]
  .pick({
    code: true,
    createdAt: true,
    customerCompanyName: true,
    customerId: true,
    id: true,
    job: true,
    kind: true,
    plannedDeliveryDate: true,
    productId: true,
    quotedBasePrice: true,
    quotedCurrencyCode: true,
    status: true,
    workTitle: true,
  })
  .extend({ links: QuoteLinks, product: z.null() });

export type FindQuotesResponse = z.infer<typeof FindQuotesResponse>;
export const FindQuotesResponse = z.array(z.discriminatedUnion('kind', [FindProductQuote, FindCustomQuote]));

export function toCoreQuoteListInput(input: FindQuotesInput): QuoteListInput {
  return {
    filters: { statuses: [] },
    page: 1,
    pageSize: 0,
    search: input.search,
    sortBy: 'code',
    sortDirection: 'asc',
  };
}

export function toFindQuotesResponse(result: QuoteListResult, access: UserAccessSummary | null): FindQuotesResponse {
  return FindQuotesResponse.parse(
    result.items.map((quote) => ({
      code: quote.code,
      createdAt: quote.createdAt,
      customerCompanyName: quote.customerCompanyName,
      customerId: quote.customerId,
      id: quote.id,
      job: quote.job,
      kind: quote.kind,
      links: createQuoteLinks(quote, access),
      plannedDeliveryDate: quote.plannedDeliveryDate,
      product: quote.product,
      productId: quote.productId,
      quotedBasePrice: quote.quotedBasePrice,
      quotedCurrencyCode: quote.quotedCurrencyCode,
      status: quote.status,
      workTitle: quote.workTitle,
    })),
  );
}

function createQuoteLinks(
  quote: QuoteListResult['items'][number],
  access: UserAccessSummary | null,
): z.infer<typeof QuoteLinks> {
  return {
    app: createQuoteAppHref(quote.id),
    ...(hasPermission(access, 'customer:read') ? { customer: createCustomerAppHref(quote.customerId) } : {}),
    ...(quote.job && hasPermission(access, 'job:read') ? { job: createJobAppHref(quote.job.jobId) } : {}),
    ...(quote.productId && hasPermission(access, 'product:read')
      ? { product: createProductAppHref(quote.productId) }
      : {}),
  };
}

export const findQuotesDefinition = {
  name: 'findQuotes',
  description: [
    'Search for Quotes by Quote Code, Customer, Product, model code, Custom Work Title, linked Job Code, or UUID.',
    'Returns lightweight commercial and identity matches with code-owned app and relationship links.',
    'Call getQuote with the selected id when full Quote details are needed.',
  ].join('\n'),
  inputSchema: FindQuotesInput,
  outputSchema: FindQuotesResponse,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiV2Context): Promise<FindQuotesResponse> {
    const input = FindQuotesInput.parse(args ?? {});
    const result = await quotesCore.listQuotes({ db: ctx.db, input: toCoreQuoteListInput(input) });
    return toFindQuotesResponse(result, ctx.access);
  },
} as const;
