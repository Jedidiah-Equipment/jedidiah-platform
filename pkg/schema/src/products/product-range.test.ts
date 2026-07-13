import { describe, expect, it } from 'vitest';

import {
  ProductRange,
  ProductRangeCreateInput,
  ProductRangeReorderInput,
  ProductRangeTranslations,
  ProductRangeUpdateInput,
  ProductRangeVariantCreateInput,
  ProductRangeVariantReorderInput,
  ProductRangeVariantTranslations,
  ProductRangeVariantUpdateInput,
} from './product-range.js';

const RANGE_ID = '00000000-0000-4000-8000-000000000001';
const VARIANT_ID = '00000000-0000-4000-8000-000000000011';
const IMAGE = {
  byteSize: 1024,
  contentType: 'image/png',
  updatedAt: '2026-05-27T10:35:03.013Z',
};

describe('ProductRange', () => {
  it('exposes client-safe image and logo references, each allowing null', () => {
    const base = {
      id: RANGE_ID,
      name: 'Example Range',
      description: null,
      displayOrder: 0,
      variants: [],
      createdAt: '2026-05-27T10:35:03.013Z',
      updatedAt: '2026-05-27T10:35:03.013Z',
    };

    expect(ProductRange.parse({ ...base, image: IMAGE, logo: IMAGE }).image).toEqual(IMAGE);
    expect(ProductRange.parse({ ...base, image: IMAGE, logo: IMAGE }).logo).toEqual(IMAGE);
    expect(ProductRange.parse({ ...base, image: null, logo: null }).logo).toBeNull();
  });

  it('carries an optional marketing description and a displayOrder', () => {
    const base = {
      id: RANGE_ID,
      name: 'Example Range',
      image: null,
      logo: null,
      variants: [],
      displayOrder: 3,
      createdAt: '2026-05-27T10:35:03.013Z',
      updatedAt: '2026-05-27T10:35:03.013Z',
    };

    expect(ProductRange.parse({ ...base, description: 'Built for the field.' }).description).toBe(
      'Built for the field.',
    );
    expect(ProductRange.parse({ ...base, description: null }).description).toBeNull();
    expect(ProductRange.parse({ ...base, description: null }).displayOrder).toBe(3);
  });
});

describe('Range translation blobs', () => {
  it('validates locale-keyed Range and Variant translations', () => {
    const metadata = { sourceHash: 'abc123', translatedAt: '2026-07-13T10:00:00.000Z' };

    expect(
      ProductRangeTranslations.parse({
        af: { ...metadata, name: 'Kuilvoerreeks', description: 'Gebou vir die oes.' },
      }),
    ).toMatchObject({ af: { name: 'Kuilvoerreeks' } });
    expect(ProductRangeVariantTranslations.parse({ af: { ...metadata, name: 'Wye bak' } })).toMatchObject({
      af: { name: 'Wye bak' },
    });
  });
});

describe('ProductRangeVariant inputs', () => {
  it('trims required variant names on create and update', () => {
    expect(ProductRangeVariantCreateInput.parse({ rangeId: RANGE_ID, name: '  Heavy Duty  ' })).toEqual({
      rangeId: RANGE_ID,
      name: 'Heavy Duty',
    });
    expect(ProductRangeVariantUpdateInput.parse({ id: VARIANT_ID, rangeId: RANGE_ID, name: '  Compact  ' })).toEqual({
      id: VARIANT_ID,
      rangeId: RANGE_ID,
      name: 'Compact',
    });
  });

  it('rejects blank variant names and accepts scoped reorder payloads', () => {
    expect(() => ProductRangeVariantCreateInput.parse({ rangeId: RANGE_ID, name: '   ' })).toThrow();
    expect(ProductRangeVariantReorderInput.parse({ rangeId: RANGE_ID, orderedIds: [VARIANT_ID] })).toEqual({
      rangeId: RANGE_ID,
      orderedIds: [VARIANT_ID],
    });
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

  it('rejects create/update payloads carrying logo or displayOrder', () => {
    expect(() => ProductRangeCreateInput.parse({ name: 'Example Range', logo: IMAGE })).toThrow();
    expect(() => ProductRangeCreateInput.parse({ name: 'Example Range', displayOrder: 2 })).toThrow();
  });
});

describe('ProductRangeReorderInput', () => {
  it('accepts a non-empty list of ids and rejects an empty one', () => {
    expect(ProductRangeReorderInput.parse({ orderedIds: [RANGE_ID] })).toEqual({ orderedIds: [RANGE_ID] });
    expect(() => ProductRangeReorderInput.parse({ orderedIds: [] })).toThrow();
  });
});
