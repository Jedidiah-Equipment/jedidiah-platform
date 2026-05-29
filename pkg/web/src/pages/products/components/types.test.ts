import type { Product } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { toProductAssemblyInputs, toProductFormValues } from './types.js';

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';
const STANDARD_ID = '550e8400-e29b-41d4-a716-446655440001';
const OPTIONAL_ID = '550e8400-e29b-41d4-a716-446655440002';

function buildProduct(overrides: Record<string, unknown> = {}): Product {
  return {
    id: PRODUCT_ID,
    name: 'Widget',
    description: 'A widget',
    modelCode: 'MOD-1',
    basePrice: 1000,
    buildTimeDays: 14,
    currencyCode: 'ZAR',
    assemblies: [
      { id: STANDARD_ID, productId: PRODUCT_ID, kind: 'standard', name: 'Base', parts: [] },
      {
        id: OPTIONAL_ID,
        productId: PRODUCT_ID,
        kind: 'optional',
        name: 'Extra',
        price: 250,
        parts: [],
        overrideStandardAssemblyIds: [STANDARD_ID],
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as Product;
}

describe('toProductFormValues', () => {
  it('returns blank defaults when no product is provided', () => {
    const values = toProductFormValues();

    expect(values.name).toBe('');
    expect(values.modelCode).toBe('');
    expect(values.description).toBe('');
    expect(values.currencyCode).toBe('ZAR');
    expect(values.assemblies).toEqual([]);
    expect(Number.isNaN(values.basePrice)).toBe(true);
    expect(Number.isNaN(values.buildTimeDays)).toBe(true);
  });

  it('maps an existing product into form state', () => {
    const values = toProductFormValues(buildProduct());

    expect(values.name).toBe('Widget');
    expect(values.basePrice).toBe(1000);
    expect(values.buildTimeDays).toBe(14);
    expect(values.assemblies).toHaveLength(2);
  });

  it('collapses a null description to an empty string', () => {
    expect(toProductFormValues(buildProduct({ description: null })).description).toBe('');
  });
});

describe('toProductAssemblyInputs', () => {
  it('maps standard and optional assemblies into editor inputs', () => {
    expect(toProductAssemblyInputs(buildProduct())).toEqual([
      { id: STANDARD_ID, kind: 'standard', name: 'Base', parts: [] },
      {
        id: OPTIONAL_ID,
        kind: 'optional',
        name: 'Extra',
        price: 250,
        parts: [],
        overrideStandardAssemblyIds: [STANDARD_ID],
      },
    ]);
  });

  it('returns an empty array when there is no product', () => {
    expect(toProductAssemblyInputs()).toEqual([]);
  });
});
