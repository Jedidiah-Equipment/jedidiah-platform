import { z } from 'zod';

import { UUID } from '../common/uuid.js';
import {
  TranslatableProductFields,
  TranslatableProductRangeFields,
  TranslatableProductRangeVariantFields,
} from './catalog-translation.js';
import { AssemblyName, ProductName } from './product.js';
import { ProductRangeName, ProductRangeVariantName } from './product-range.js';

export type CatalogProductNeedsReviewField = z.infer<typeof CatalogProductNeedsReviewField>;
export const CatalogProductNeedsReviewField = z.discriminatedUnion('kind', [
  z.object({ field: TranslatableProductFields.keyof(), kind: z.literal('product') }),
  z.object({ kind: z.literal('assembly'), name: AssemblyName }),
]);

export type CatalogProductRangeNeedsReviewField = z.infer<typeof CatalogProductRangeNeedsReviewField>;
export const CatalogProductRangeNeedsReviewField = z.object({
  field: TranslatableProductRangeFields.keyof(),
  kind: z.literal('range'),
});

export type CatalogProductRangeVariantNeedsReviewField = z.infer<typeof CatalogProductRangeVariantNeedsReviewField>;
export const CatalogProductRangeVariantNeedsReviewField = z.object({
  field: TranslatableProductRangeVariantFields.keyof(),
  kind: z.literal('variant'),
});

const CatalogTranslationNeedsReviewItemBase = z.object({ id: UUID });

export type CatalogTranslationNeedsReviewItem = z.infer<typeof CatalogTranslationNeedsReviewItem>;
export const CatalogTranslationNeedsReviewItem = z.discriminatedUnion('kind', [
  CatalogTranslationNeedsReviewItemBase.extend({
    affectedFields: z.array(CatalogProductNeedsReviewField).min(1),
    kind: z.literal('product'),
    name: ProductName,
  }),
  CatalogTranslationNeedsReviewItemBase.extend({
    affectedFields: z.array(CatalogProductRangeNeedsReviewField).min(1),
    kind: z.literal('range'),
    name: ProductRangeName,
  }),
  CatalogTranslationNeedsReviewItemBase.extend({
    affectedFields: z.array(CatalogProductRangeVariantNeedsReviewField).min(1),
    kind: z.literal('variant'),
    name: ProductRangeVariantName,
    rangeId: UUID,
  }),
]);

export type CatalogTranslationNeedsReviewList = z.infer<typeof CatalogTranslationNeedsReviewList>;
export const CatalogTranslationNeedsReviewList = z.array(CatalogTranslationNeedsReviewItem);
