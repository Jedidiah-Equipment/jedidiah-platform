import { describe, expect, test } from 'vitest';

import { createProductAppHref, InternalAppHref } from './entity-links.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';

describe('v2 entity links', () => {
  test('creates the code-owned Product app route', () => {
    expect(createProductAppHref(PRODUCT_ID)).toBe(`/products/${PRODUCT_ID}/edit`);
  });

  test('accepts only internal absolute-path links', () => {
    expect(InternalAppHref.parse(`/products/${PRODUCT_ID}/edit`)).toBe(`/products/${PRODUCT_ID}/edit`);
    expect(() => InternalAppHref.parse('//example.com/products/1')).toThrow();
    expect(() => InternalAppHref.parse('/\\example.com/products/1')).toThrow();
    expect(() => InternalAppHref.parse('https://example.com/products/1')).toThrow();
    expect(() => InternalAppHref.parse('/products/1\nexample')).toThrow();
  });
});
