import { describe, expect, it } from 'vitest';

import {
  getProductListPresentation,
  isProductSort,
  landerProductUrls,
  normalizeRangeFilter,
} from './product-presentation';

describe('Product list presentation', () => {
  it('maps the all-Range name sort to server input', () => {
    expect(getProductListPresentation('all', 'name')).toEqual({
      columnFilters: {},
      sortBy: 'name',
      sortDirection: 'asc',
    });
  });

  it('maps a selected Range and price sort to server input', () => {
    expect(getProductListPresentation('11111111-1111-4111-8111-111111111111', 'price')).toEqual({
      columnFilters: { rangeId: '11111111-1111-4111-8111-111111111111' },
      sortBy: 'basePrice',
      sortDirection: 'asc',
    });
  });
});

describe('persisted Product controls', () => {
  it('accepts only known sort values', () => {
    expect(isProductSort('name')).toBe(true);
    expect(isProductSort('price')).toBe(true);
    expect(isProductSort('basePrice')).toBe(false);
    expect(isProductSort(null)).toBe(false);
  });

  it('falls back to all Products when a persisted Range no longer exists', () => {
    expect(normalizeRangeFilter('removed-range', ['range-a', 'range-b'])).toBe('all');
    expect(normalizeRangeFilter('range-b', ['range-a', 'range-b'])).toBe('range-b');
    expect(normalizeRangeFilter('all', ['range-a', 'range-b'])).toBe('all');
  });
});

describe('landerProductUrls', () => {
  it('builds canonical English and Afrikaans Product URLs', () => {
    expect(landerProductUrls('https://jedidiahequipment.co.za', 'FF 5000/XL')).toEqual({
      en: 'https://jedidiahequipment.co.za/products/FF%205000%2FXL',
      af: 'https://jedidiahequipment.co.za/af/products/FF%205000%2FXL',
    });
  });
});
