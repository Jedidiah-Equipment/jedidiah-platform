import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Product, ProductAssembliesInput, ProductCreateInput, ProductUpdateInput } from './product.js';

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
  it('preserves omitted assemblies as undefined', () => {
    expect(
      ProductUpdateInput.parse({
        id: '00000000-0000-4000-8000-000000000102',
        basePrice: 1234.56,
        currencyCode: 'ZAR',
        description: '',
        buildTimeDays: '14',
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toEqual({
      id: '00000000-0000-4000-8000-000000000102',
      basePrice: 1234.56,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
    });
  });
});

describe('Product', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Product)).not.toThrow();
  });
});
