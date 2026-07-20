import { describe, expect, test } from 'vitest';

import { productImageCachePath, resolveProductImage } from './product-image-cache';

describe('productImageCachePath', () => {
  test('derives a stable WebP cache path from the Product image identity', () => {
    expect(
      productImageCachePath('file:///cache', {
        productId: 'product-123',
        slot: 'primary',
        updatedAt: '1970-01-01T00:00:01.234Z',
      }),
    ).toBe('file:///cache/product-images/product-123-primary-1234.webp');
  });

  test('changes the cache path when an image is replaced', () => {
    const original = productImageCachePath('file:///cache/', {
      productId: 'product-123',
      slot: 'primary',
      updatedAt: '1970-01-01T00:00:01.234Z',
    });
    const replacement = productImageCachePath('file:///cache/', {
      productId: 'product-123',
      slot: 'primary',
      updatedAt: '1970-01-01T00:00:05.678Z',
    });

    expect(replacement).toBe('file:///cache/product-images/product-123-primary-5678.webp');
    expect(replacement).not.toBe(original);
  });
});

describe('resolveProductImage', () => {
  const key = {
    productId: 'product-123',
    slot: 'primary',
    updatedAt: '1970-01-01T00:00:01.234Z',
  } as const;

  test('uses the cache only when the derived file exists', () => {
    expect(resolveProductImage(true, key)).toEqual({ kind: 'cached' });
    expect(resolveProductImage(false, key)).toEqual({ kind: 'fetch' });
  });
});
