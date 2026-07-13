import { z } from 'zod';

export const CatalogTranslationMetadata = z.object({
  sourceHash: z.string(),
  translatedAt: z.iso.datetime({ offset: true }),
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
