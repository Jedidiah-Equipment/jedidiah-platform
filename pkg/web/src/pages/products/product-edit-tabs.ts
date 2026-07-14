import { z } from 'zod';

export const ProductEditTab = z.enum(['details', 'bays', 'assemblies', 'images', 'documents', 'translations', 'audit']);
export type ProductEditTab = z.infer<typeof ProductEditTab>;

export const ProductEditSearch = z.object({
  tab: ProductEditTab.default('details').catch('details'),
});

export function resolveProductEditTab(tab: ProductEditTab, canReadAudit: boolean): ProductEditTab {
  return tab === 'audit' && !canReadAudit ? 'details' : tab;
}
