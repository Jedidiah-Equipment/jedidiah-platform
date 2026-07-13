import { z } from 'zod';

export const CatalogTranslationMetadata = z.object({
  sourceHash: z.string(),
  translatedAt: z.iso.datetime({ offset: true }),
});
