import type { Product } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { isProductSort, landerProductUrls, normalizeRangeFilter, presentProducts } from './product-presentation';

function product(id: string, name: string, basePrice: number, rangeId: string): Product {
  return { id, name, basePrice, rangeId } as Product;
}

const productNames = (products: readonly Product[]) => products.map((item) => item.name);

describe('presentProducts', () => {
  it('filters Products to the selected Range and sorts them by name', () => {
    const products = [
      product('p-1', 'Zebra Trailer', 30, 'range-a'),
      product('p-2', 'Alpha Trailer', 20, 'range-a'),
      product('p-3', 'Middle Trailer', 10, 'range-b'),
    ];

    expect(productNames(presentProducts(products, 'range-a', 'name'))).toEqual(['Alpha Trailer', 'Zebra Trailer']);
  });

  it('sorts all Products by base price without mutating the API result', () => {
    const products = [
      product('p-1', 'Premium', 300_000, 'range-a'),
      product('p-2', 'Entry', 100_000, 'range-b'),
      product('p-3', 'Mid', 200_000, 'range-a'),
    ];
    const original = [...products];

    expect(productNames(presentProducts(products, 'all', 'price'))).toEqual(['Entry', 'Mid', 'Premium']);
    expect(products).toEqual(original);
  });

  it('uses name as a stable price tie-breaker', () => {
    const products = [product('p-1', 'Zebra', 100, 'range-a'), product('p-2', 'Alpha', 100, 'range-b')];

    expect(productNames(presentProducts(products, 'all', 'price'))).toEqual(['Alpha', 'Zebra']);
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
