import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Product, ProductCreateInput } from './product.js';

describe('ProductCreateInput', () => {
  it('normalizes product catalog fields', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: '1234.56',
        description: '  Earthmoving equipment  ',
        leadTimeDays: '14',
        modelCode: '  WL-100  ',
        name: '  Wheel Loader  ',
      }),
    ).toEqual({
      basePrice: 1234.56,
      currencyCode: 'ZAR',
      description: 'Earthmoving equipment',
      leadTimeDays: 14,
      modelCode: 'WL-100',
      name: 'Wheel Loader',
    });
  });

  it('treats an empty description as null', () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 0,
        description: '  ',
        leadTimeDays: 0,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }).description,
    ).toBeNull();
  });

  it('requires a model code and nonnegative price', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: -1,
        leadTimeDays: 1,
        modelCode: '  ',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });

  it('requires nonnegative whole lead time days', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: 1,
        leadTimeDays: -1,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toThrow();

    expect(() =>
      ProductCreateInput.parse({
        basePrice: 1,
        leadTimeDays: 1.5,
        modelCode: 'WL-100',
        name: 'Wheel Loader',
      }),
    ).toThrow();
  });

  it('rejects a missing base price', () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: NaN,
        leadTimeDays: 1,
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
