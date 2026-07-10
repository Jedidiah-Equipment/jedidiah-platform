import { hasPermission } from '@pkg/domain';
import { QuoteDetail, QuoteProductDetailFacts, type UserAccessSummary } from '@pkg/schema';
import { z } from 'zod';

import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createQuoteAppHref,
  InternalAppHref,
} from '@/v2/entity-links.js';
import { ProductBayResponse } from '@/v2/tools/products/product-bay-response.js';

export type QuoteLinks = z.infer<typeof QuoteLinks>;
export const QuoteLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  job: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
});

export function createQuoteLinks(
  quote: { customerId: string; id: string; job: { jobId: string } | null; productId: string | null },
  access: UserAccessSummary | null,
): QuoteLinks {
  return QuoteLinks.parse({
    app: createQuoteAppHref(quote.id),
    ...(hasPermission(access, 'customer:read') ? { customer: createCustomerAppHref(quote.customerId) } : {}),
    ...(quote.job && hasPermission(access, 'job:read') ? { job: createJobAppHref(quote.job.jobId) } : {}),
    ...(quote.productId && hasPermission(access, 'product:read')
      ? { product: createProductAppHref(quote.productId) }
      : {}),
  });
}

const QuoteProductResponse = QuoteProductDetailFacts.omit({ bays: true, thumbnailDataUrl: true }).extend({
  bays: z.array(ProductBayResponse),
});

const ProductQuoteResponse = QuoteDetail.options[0]
  .omit({ customerThumbnailDataUrl: true, product: true, salesPersonThumbnailDataUrl: true })
  .extend({ links: QuoteLinks, product: QuoteProductResponse });

const CustomQuoteResponse = QuoteDetail.options[1]
  .omit({ customerThumbnailDataUrl: true, product: true, salesPersonThumbnailDataUrl: true })
  .extend({ links: QuoteLinks, product: z.null() });

export type QuoteDetailResponse = z.infer<typeof QuoteDetailResponse>;
export const QuoteDetailResponse = z.discriminatedUnion('kind', [ProductQuoteResponse, CustomQuoteResponse]);

export function toQuoteDetailResponse(quote: QuoteDetail, access: UserAccessSummary | null): QuoteDetailResponse {
  return QuoteDetailResponse.parse({
    ...quote,
    links: createQuoteLinks(quote, access),
  });
}
