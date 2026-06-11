import type { Product } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  toProductAssemblyInputs,
  toProductBayInputs,
  toProductCreateInput,
  toProductFormValues,
  toProductMinimalCreateInput,
  toProductUpdateInput,
} from './types.js';

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';
const STANDARD_ID = '550e8400-e29b-41d4-a716-446655440001';
const OPTIONAL_ID = '550e8400-e29b-41d4-a716-446655440002';
const BAY_ID = '550e8400-e29b-41d4-a716-446655440003';

function buildProduct(overrides: Record<string, unknown> = {}): Product {
  return {
    id: PRODUCT_ID,
    name: 'Widget',
    description: 'A widget',
    modelCode: 'MOD-1',
    basePrice: 1000,
    buildTimeDays: 14,
    currencyCode: 'ZAR',
    requiresVinNumber: false,
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
    productBays: [
      {
        bay: {
          createdAt: '2026-01-01T00:00:00.000Z',
          department: 'fabrication',
          disabledAt: null,
          id: BAY_ID,
          name: 'Fab Bay 1',
          scheduleOrigin: '2026-01-01',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        bayId: BAY_ID,
        defaultWorkingDays: 5,
        productId: PRODUCT_ID,
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
    expect(values.requiresVinNumber).toBe(false);
    expect(values.assemblies).toEqual([]);
    expect(values.productBays).toEqual([]);
    expect(Number.isNaN(values.basePrice)).toBe(true);
    expect(Number.isNaN(values.buildTimeDays)).toBe(true);
  });

  it('maps an existing product into form state', () => {
    const values = toProductFormValues(buildProduct());

    expect(values.name).toBe('Widget');
    expect(values.basePrice).toBe(1000);
    expect(values.buildTimeDays).toBe(14);
    expect(values.requiresVinNumber).toBe(false);
    expect(values.assemblies).toHaveLength(2);
    expect(values.productBays).toEqual([{ bayId: BAY_ID, defaultWorkingDays: 5 }]);
  });

  it('maps an existing product VIN requirement into form state', () => {
    expect(toProductFormValues(buildProduct({ requiresVinNumber: true })).requiresVinNumber).toBe(true);
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

describe('toProductBayInputs', () => {
  it('maps product Bays into editor inputs', () => {
    expect(toProductBayInputs(buildProduct())).toEqual([{ bayId: BAY_ID, defaultWorkingDays: 5 }]);
  });

  it('returns an empty array when there is no product', () => {
    expect(toProductBayInputs()).toEqual([]);
  });
});

describe('toProductCreateInput', () => {
  it('maps full form values through the create schema', () => {
    expect(toProductCreateInput(toProductFormValues(buildProduct({ description: null })))).toEqual({
      assemblies: [
        { id: STANDARD_ID, kind: 'standard', name: 'Base', parts: [] },
        {
          id: OPTIONAL_ID,
          kind: 'optional',
          name: 'Extra',
          overrideStandardAssemblyIds: [STANDARD_ID],
          parts: [],
          price: 250,
        },
      ],
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'MOD-1',
      name: 'Widget',
      productBays: [{ bayId: BAY_ID, defaultWorkingDays: 5 }],
      requiresVinNumber: false,
      thumbnailDataUrl: null,
    });
  });
});

describe('toProductMinimalCreateInput', () => {
  it('creates a catalog shell with schema defaults for omitted edit-only fields', () => {
    expect(
      toProductMinimalCreateInput({
        basePrice: 120_000,
        buildTimeDays: 14,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toEqual({
      assemblies: [],
      basePrice: 120_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      productBays: [],
      requiresVinNumber: false,
      thumbnailDataUrl: null,
    });
  });
});

describe('toProductUpdateInput', () => {
  it('adds the product id to the full update payload', () => {
    expect(toProductUpdateInput(PRODUCT_ID, toProductFormValues(buildProduct()))).toMatchObject({
      id: PRODUCT_ID,
      assemblies: [
        { id: STANDARD_ID, kind: 'standard', name: 'Base', parts: [] },
        {
          id: OPTIONAL_ID,
          kind: 'optional',
          name: 'Extra',
          overrideStandardAssemblyIds: [STANDARD_ID],
          parts: [],
          price: 250,
        },
      ],
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      modelCode: 'MOD-1',
      name: 'Widget',
      productBays: [{ bayId: BAY_ID, defaultWorkingDays: 5 }],
    });
  });
});
