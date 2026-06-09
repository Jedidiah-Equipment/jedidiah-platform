import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  Product,
  ProductAssembliesInput,
  ProductBaysInput,
  ProductCreateInput,
  ProductUpdateInput,
} from './product.js';

const BAY_ID = '00000000-0000-4000-8000-000000000201';

describe('ProductCreateInput', () => {
  it('normalizes product catalog fields', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: '1234.56',
        description: '  Earthmoving equipment  ',
        buildTimeDays: '14',
        modelCode: '  WL-100  ',
        name: '  Wheel Loader  ',
      }),
    ).toEqual({
      assemblies: [],
      basePrice: 1234.56,
      currencyCode: 'ZAR',
      description: 'Earthmoving equipment',
      buildTimeDays: 14,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      productBays: [],
      requiresVinNumber: false,
      thumbnailDataUrl: null,
    });
  });

  it('treats an empty description as null', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 0,
        description: '  ',
        buildTimeDays: 0,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }).description,
    ).toBeNull();
  });

  it('defaults omitted child collections to an empty catalog shell', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 120_000,
        buildTimeDays: 14,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toMatchObject({ assemblies: [], productBays: [] });
  });

  it('requires a model code and nonnegative price', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: -1,
        buildTimeDays: 1,
        modelCode: '  ',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });

  it('requires nonnegative whole build time days', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: 1,
        buildTimeDays: -1,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toThrow();

    expect(() =>
      ProductCreateInput.parse({
        basePrice: 1,
        buildTimeDays: 1.5,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });

  it('rejects a missing base price', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: NaN,
        buildTimeDays: 1,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });
});

describe('ProductBaysInput', () => {
  it('accepts positive whole default working days', () => {
    expect(ProductBaysInput.parse([{ bayId: BAY_ID, defaultWorkingDays: '5' }])).toEqual([
      { bayId: BAY_ID, defaultWorkingDays: 5 },
    ]);
  });

  it('rejects non-positive and decimal default working days', () => {
    expect(() => ProductBaysInput.parse([{ bayId: BAY_ID, defaultWorkingDays: 0 }])).toThrow();
    expect(() => ProductBaysInput.parse([{ bayId: BAY_ID, defaultWorkingDays: -1 }])).toThrow();
    expect(() => ProductBaysInput.parse([{ bayId: BAY_ID, defaultWorkingDays: 1.5 }])).toThrow();
  });

  it('rejects duplicate Bays', () => {
    expect(() =>
      ProductBaysInput.parse([
        { bayId: BAY_ID, defaultWorkingDays: 5 },
        { bayId: BAY_ID, defaultWorkingDays: 7 },
      ]),
    ).toThrow('Bay can only be added once per product');
  });
});

describe('ProductAssembliesInput', () => {
  it('rejects duplicate override targets', () => {
    const standardAssemblyId = '00000000-0000-4000-8000-000000000101';

    expect(() =>
      ProductAssembliesInput.parse([
        {
          id: standardAssemblyId,
          kind: 'standard',
          name: 'Standard bucket',
          parts: [],
        },
        {
          kind: 'optional',
          name: 'Rock bucket',
          overrideStandardAssemblyIds: [standardAssemblyId, standardAssemblyId],
          parts: [],
          price: 250,
        },
      ]),
    ).toThrow('Override target can only be selected once per assembly');
  });
});

describe('ProductUpdateInput', () => {
  it('preserves omitted child collections as undefined', () => {
    expect(
      ProductUpdateInput.parse({
        id: '00000000-0000-4000-8000-000000000102',
        basePrice: 1234.56,
        currencyCode: 'ZAR',
        description: '',
        buildTimeDays: '14',
        modelCode: 'WL-100',
        name: 'Wheel Loader',
        requiresVinNumber: true,
      }),
    ).toEqual({
      id: '00000000-0000-4000-8000-000000000102',
      basePrice: 1234.56,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      requiresVinNumber: true,
      thumbnailDataUrl: null,
    });
  });
});

describe('Product', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Product)).not.toThrow();
  });
});
