import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createProductUnitAppHref,
  createQuoteAppHref,
  InternalAppHref,
  QuoteDetail,
  QuoteProductDetailFacts,
} from '@pkg/schema/equipment';
import { z } from 'zod';
import { ProductBayResponse } from '@/equipment/tools/products/product-bay-response.js';

export type QuoteLinks = z.infer<typeof QuoteLinks>;
export const QuoteLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  job: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
  productUnit: InternalAppHref.optional(),
});

export function createQuoteLinks(
  quote: {
    customerId: string;
    id: string;
    job: { jobId: string } | null;
    productId: string | null;
    productUnitId: string | null;
  },
  access: UserAccessSummary | null,
): QuoteLinks {
  return QuoteLinks.parse({
    app: createQuoteAppHref(quote.id),
    ...(hasPermission(access, 'equipment_customer:read') ? { customer: createCustomerAppHref(quote.customerId) } : {}),
    ...(quote.job && hasPermission(access, 'equipment_job:read') ? { job: createJobAppHref(quote.job.jobId) } : {}),
    ...(quote.productId && hasPermission(access, 'equipment_product:read')
      ? { product: createProductAppHref(quote.productId) }
      : {}),
    // Only an Allocation Quote sells a machine we already hold, so only it has a Unit to link to.
    ...(quote.productUnitId && hasPermission(access, 'equipment_product_unit:read')
      ? { productUnit: createProductUnitAppHref(quote.productUnitId) }
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
