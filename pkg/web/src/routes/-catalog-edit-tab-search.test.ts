import { describe, expect, it } from 'vitest';

import { ProductRangeEditSearch } from '@/pages/product-ranges/product-range-edit-tabs.js';
import { ProductEditSearch, resolveProductEditTab } from '@/pages/products/product-edit-tabs.js';

describe('catalog edit tab search params', () => {
  it('selects a requested Product tab', () => {
    expect(ProductEditSearch.parse({ tab: 'images' })).toEqual({ tab: 'images' });
  });

  it('selects a requested Product Range tab', () => {
    expect(ProductRangeEditSearch.parse({ tab: 'variants' })).toEqual({ tab: 'variants' });
  });

  it.each([
    ['Product', ProductEditSearch],
    ['Product Range', ProductRangeEditSearch],
  ])('defaults an absent or unknown %s tab to details', (_label, schema) => {
    expect(schema.parse({})).toEqual({ tab: 'details' });
    expect(schema.parse({ tab: 'unknown' })).toEqual({ tab: 'details' });
  });

  it('defaults an unavailable Product audit tab to details', () => {
    expect(resolveProductEditTab('audit', false)).toBe('details');
    expect(resolveProductEditTab('audit', true)).toBe('audit');
  });
});
