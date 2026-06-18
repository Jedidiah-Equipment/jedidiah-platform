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
      createdAt: '2026-05-27T10:35:03.013Z',
      updatedAt: '2026-05-27T10:35:03.013Z',
    };

    expect(ProductRange.parse({ ...base, image: IMAGE }).image).toEqual(IMAGE);
    expect(ProductRange.parse({ ...base, image: null }).image).toBeNull();
  });
});

describe('ProductRange inputs', () => {
  it('accepts a bare name on create and update, rejecting any image field', () => {
    expect(ProductRangeCreateInput.parse({ name: 'Example Range' })).toEqual({ name: 'Example Range' });
    expect(ProductRangeUpdateInput.parse({ id: RANGE_ID, name: 'Example Range' })).toEqual({
      id: RANGE_ID,
      name: 'Example Range',
    });

    expect(() => ProductRangeCreateInput.parse({ name: 'Example Range', image: IMAGE })).toThrow();
    expect(() => ProductRangeUpdateInput.parse({ id: RANGE_ID, name: 'Example Range', image: null })).toThrow();
  });
});
