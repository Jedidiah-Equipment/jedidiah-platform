import { z } from 'zod';

import { UUID } from '../common/uuid.js';

export type CatalogTranslationMetadata = z.infer<typeof CatalogTranslationMetadata>;
export const CatalogTranslationMetadata = z.object({
  sourceHash: z.string(),
  translatedAt: z.iso.datetime({ offset: true }),
});

// The translatable fields of each catalog entity, declared once. Stored translation shapes, the AI
// translation I/O, and the source hashes all derive from these.
export type TranslatableProductFields = z.infer<typeof TranslatableProductFields>;
export const TranslatableProductFields = z.object({
  name: z.string(),
  nameHighlight: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  keyFeatures: z.array(z.string()),
  technicalDetails: z.array(z.object({ label: z.string(), value: z.string() })),
});

export type TranslatableAssemblyFields = z.infer<typeof TranslatableAssemblyFields>;
export const TranslatableAssemblyFields = z.object({
  name: z.string(),
});

// Assembly identity plus its translatable fields: the per-assembly unit the product translation bundle
// round-trips (ids pass through verbatim, names translate).
export type TranslatableAssembly = z.infer<typeof TranslatableAssembly>;
export const TranslatableAssembly = TranslatableAssemblyFields.extend({ id: UUID });

export type TranslatableProductRangeFields = z.infer<typeof TranslatableProductRangeFields>;
export const TranslatableProductRangeFields = z.object({
  name: z.string(),
  description: z.string().nullable(),
});

export type TranslatableProductRangeVariantFields = z.infer<typeof TranslatableProductRangeVariantFields>;
export const TranslatableProductRangeVariantFields = z.object({
  name: z.string(),
});

const CatalogTranslationStatusCounts = z.object({
  missing: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
});

export type CatalogTranslationStatus = z.infer<typeof CatalogTranslationStatus>;
export const CatalogTranslationStatus = z.object({
  products: CatalogTranslationStatusCounts,
  ranges: CatalogTranslationStatusCounts,
  variants: CatalogTranslationStatusCounts,
});
