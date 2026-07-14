import { z } from 'zod';

export const ProductRangeEditTab = z.enum(['details', 'variants', 'translations']);
export type ProductRangeEditTab = z.infer<typeof ProductRangeEditTab>;

export const ProductRangeEditSearch = z.object({
  tab: ProductRangeEditTab.default('details').catch('details'),
});
