import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Product, ProductCreateInput } from './product.js';

describe('ProductCreateInput', () => {
  it('normalizes product catalog fields', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: '1234.56',
        description: '  Earthmoving equipment  ',
        modelCode: '  WL-100  ',
        name: '  Wheel Loader  ',
      }),
    ).toEqual({
      basePrice: 1234.56,
      currencyCode: 'ZAR',
      departmentConfigs: [],
      description: 'Earthmoving equipment',
      modelCode: 'WL-100',
      name: 'Wheel Loader',
      options: [],
    });
  });

  it('treats an empty description as null', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 0,
        description: '  ',
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }).description,
    ).toBeNull();
  });

  it('requires a model code and nonnegative price', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: -1,
        modelCode: '  ',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });

  it('rejects a missing base price', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: NaN,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });

  it('rejects duplicate default station ids', () => {
    const stationId = '00000000-0000-4000-8000-000000000001';

    expect(() =>
      ProductCreateInput.parse({
        basePrice: 1_000,
        departmentConfigs: [
          {
            defaultStationIds: [stationId],
            department: 'fabrication',
            durationDays: 1,
          },
          {
            defaultStationIds: [stationId],
            department: 'paint',
            durationDays: 1,
          },
        ],
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });
});

describe('Product', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Product)).not.toThrow();
  });
});
