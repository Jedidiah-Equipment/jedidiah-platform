import { describe, expect, it } from 'vitest';

import { ProductRange, ProductRangeCreateInput, ProductRangeUpdateInput } from './product-range.js';

const RANGE_ID = '00000000-0000-4000-8000-000000000001';
const IMAGE = {
  byteSize: 1024,
  contentType: 'image/png',
  updatedAt: '2026-05-27T10:35:03.013Z',
};

describe('ProductRange', () => {
  it('exposes a client-safe image reference and allows it to be null', () => {
    const base = {
      id: RANGE_ID,
      name: 'Example Range',
      description: null,
      createdAt: '2026-05-27T10:35:03.013Z',
      updatedAt: '2026-05-27T10:35:03.013Z',
    };

    expect(ProductRange.parse({ ...base, image: IMAGE }).image).toEqual(IMAGE);
    expect(ProductRange.parse({ ...base, image: null }).image).toBeNull();
  });

  it('carries an optional marketing description', () => {
    const base = {
      id: RANGE_ID,
      name: 'Example Range',
      image: null,
      createdAt: '2026-05-27T10:35:03.013Z',
      updatedAt: '2026-05-27T10:35:03.013Z',
    };

    expect(ProductRange.parse({ ...base, description: 'Built for the field.' }).description).toBe(
      'Built for the field.',
    );
    expect(ProductRange.parse({ ...base, description: null }).description).toBeNull();
  });
});

describe('ProductRange inputs', () => {
  it('accepts a bare name on create and update, defaulting description to null and rejecting any image field', () => {
    expect(ProductRangeCreateInput.parse({ name: 'Example Range' })).toEqual({
      name: 'Example Range',
      description: null,
    });
    expect(ProductRangeUpdateInput.parse({ id: RANGE_ID, name: 'Example Range' })).toEqual({
      id: RANGE_ID,
      name: 'Example Range',
      description: null,
    });

    expect(() => ProductRangeCreateInput.parse({ name: 'Example Range', image: IMAGE })).toThrow();
    expect(() => ProductRangeUpdateInput.parse({ id: RANGE_ID, name: 'Example Range', image: null })).toThrow();
  });

  it('normalizes a blank description to null and trims a provided one', () => {
    expect(ProductRangeCreateInput.parse({ name: 'Example Range', description: '   ' }).description).toBeNull();
    expect(
      ProductRangeUpdateInput.parse({ id: RANGE_ID, name: 'Example Range', description: '  Tough kit.  ' }).description,
    ).toBe('Tough kit.');
  });
});
