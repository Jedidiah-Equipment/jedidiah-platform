import type { Product } from '@pkg/schema';

import { createLiteralGuard } from './use-persisted-state';

export type ProductSort = 'name' | 'price';
/** The literal 'all' or a Product Range id. Honestly a string — a literal union would collapse. */
export type RangeFilter = string;

export const isProductSort = createLiteralGuard(['name', 'price']);

export function isRangeFilter(value: unknown): value is RangeFilter {
  return typeof value === 'string' && value.length > 0;
}

export function normalizeRangeFilter(range: RangeFilter, availableRangeIds: readonly string[]): RangeFilter {
  return range === 'all' || availableRangeIds.includes(range) ? range : 'all';
}

export function presentProducts(items: readonly Product[], range: RangeFilter, sort: ProductSort): Product[] {
  const filtered = range === 'all' ? items : items.filter((product) => product.rangeId === range);

  return [...filtered].sort((left, right) => {
    if (sort === 'price') {
      const priceOrder = left.basePrice - right.basePrice;
      if (priceOrder !== 0) return priceOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

export function landerProductUrls(origin: string, modelCode: string): { en: string; af: string } {
  const encoded = encodeURIComponent(modelCode);

  return { en: `${origin}/products/${encoded}`, af: `${origin}/af/products/${encoded}` };
}
