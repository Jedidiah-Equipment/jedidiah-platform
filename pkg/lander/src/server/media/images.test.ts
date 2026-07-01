import { productRanges, products } from '@pkg/db';
import { expect } from 'vitest';

import { test } from '../../test/tester.js';
import { resolveProductImageRef, resolveRangeImageRef } from './images.js';

test('resolveRangeImageRef returns the storage key for a Range that has an image', async ({ db }) => {
  const storageKey = `range-images/product-range/${crypto.randomUUID()}/cover.png`;
  const [range] = await db
    .insert(productRanges)
    .values({
      name: `Lander Image Range ${crypto.randomUUID()}`,
      displayOrder: 0,
      image: { byteSize: 3, contentType: 'image/png', storageKey, updatedAt: new Date().toISOString() },
    })
    .returning();
  if (!range) throw new Error('insert did not return a row');

  expect(await resolveRangeImageRef(db, range.id)).toEqual({ contentType: 'image/png', storageKey });
});

test('resolveRangeImageRef returns null for a Range with no image', async ({ db }) => {
  const [range] = await db
    .insert(productRanges)
    .values({ name: `Lander Blank Image Range ${crypto.randomUUID()}`, image: null, displayOrder: 0 })
    .returning();
  if (!range) throw new Error('insert did not return a row');

  expect(await resolveRangeImageRef(db, range.id)).toBeNull();
});

test('resolveRangeImageRef returns null for an unknown Range id', async ({ db }) => {
  expect(await resolveRangeImageRef(db, crypto.randomUUID())).toBeNull();
});

test('resolveRangeImageRef returns null for a malformed id rather than querying', async ({ db }) => {
  expect(await resolveRangeImageRef(db, 'not-a-uuid')).toBeNull();
});

test('resolveProductImageRef returns the requested slot reference', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const primaryKey = `product-images/product/${suffix}/primary/cover.png`;
  const secondaryKey = `product-images/product/${suffix}/secondary1/cover.jpg`;
  const [range] = await db
    .insert(productRanges)
    .values({ name: `Lander Product Image Range ${suffix}`, displayOrder: 0 })
    .returning();
  if (!range) throw new Error('range insert did not return a row');

  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 5,
      images: {
        primary: { byteSize: 1, contentType: 'image/png', storageKey: primaryKey, updatedAt: new Date().toISOString() },
        secondary1: {
          byteSize: 1,
          contentType: 'image/jpeg',
          storageKey: secondaryKey,
          updatedAt: new Date().toISOString(),
        },
      },
      modelCode: `IMG-${suffix}`,
      name: `Lander Product Image ${suffix}`,
      rangeId: range.id,
    })
    .returning();
  if (!product) throw new Error('product insert did not return a row');

  expect(await resolveProductImageRef(db, product.id, 'secondary1')).toEqual({
    contentType: 'image/jpeg',
    storageKey: secondaryKey,
  });
});

test('resolveProductImageRef falls back to primary when the requested slot is missing or invalid', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const primaryKey = `product-images/product/${suffix}/primary/cover.png`;
  const [range] = await db
    .insert(productRanges)
    .values({ name: `Lander Product Fallback Range ${suffix}`, displayOrder: 0 })
    .returning();
  if (!range) throw new Error('range insert did not return a row');

  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 5,
      images: {
        primary: { byteSize: 1, contentType: 'image/png', storageKey: primaryKey, updatedAt: new Date().toISOString() },
      },
      modelCode: `IMG-FALLBACK-${suffix}`,
      name: `Lander Product Fallback ${suffix}`,
      rangeId: range.id,
    })
    .returning();
  if (!product) throw new Error('product insert did not return a row');

  expect((await resolveProductImageRef(db, product.id))?.storageKey).toBe(primaryKey);
  expect((await resolveProductImageRef(db, product.id, 'not-a-slot'))?.storageKey).toBe(primaryKey);
});

test('resolveProductImageRef returns null for an unknown Product id', async ({ db }) => {
  expect(await resolveProductImageRef(db, crypto.randomUUID())).toBeNull();
});
