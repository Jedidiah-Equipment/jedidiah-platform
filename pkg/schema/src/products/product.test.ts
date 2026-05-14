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
});

describe('Product', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Product)).not.toThrow();
  });
});
