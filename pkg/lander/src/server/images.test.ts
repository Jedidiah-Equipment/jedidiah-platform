import { type StorageAdapter, StorageObjectNotFoundError, type StoredObject } from '@pkg/core';
import { productRanges, products } from '@pkg/db';
import { expect } from 'vitest';

import { test } from '../test/tester.js';
import { readProductImageSlot, readRangeImage } from './images.js';

async function* bytesOf(payload: Uint8Array): AsyncIterable<Uint8Array> {
  yield payload;
}

// A minimal in-memory stand-in for the S3 adapter: `get` serves preset objects and otherwise reports the
// object as missing, exercising the read services without real object storage.
function fakeStorage(objects: Record<string, StoredObject> = {}): StorageAdapter {
  return {
    get: async (key) => {
      const object = objects[key];
      if (!object) {
        throw new StorageObjectNotFoundError(key);
      }

      return object;
    },
    deleteObject: async () => {},
    put: async () => {},
  };
}

test('readRangeImage streams the stored object for a Range that has an image', async ({ db }) => {
  const storageKey = `range-images/product-range/${crypto.randomUUID()}/cover.webp`;
  const payload = new Uint8Array([9, 8, 7]);
  const [range] = await db
    .insert(productRanges)
    .values({
      name: `Lander Image Range ${crypto.randomUUID()}`,
      displayOrder: 0,
      image: {
        byteSize: payload.byteLength,
        contentType: 'image/webp',
        storageKey,
        updatedAt: new Date().toISOString(),
      },
    })
    .returning();
  if (!range) throw new Error('insert did not return a row');

  const object: StoredObject = { body: bytesOf(payload), byteSize: payload.byteLength, contentType: 'image/webp' };
  const result = await readRangeImage(fakeStorage({ [storageKey]: object }), db, range.id);

  expect(result?.contentType).toBe('image/webp');
});

test('readRangeImage returns null for a Range with no image', async ({ db }) => {
  const [range] = await db
    .insert(productRanges)
    .values({ name: `Lander Blank Image Range ${crypto.randomUUID()}`, image: null, displayOrder: 0 })
    .returning();
  if (!range) throw new Error('insert did not return a row');

  expect(await readRangeImage(fakeStorage(), db, range.id)).toBeNull();
});

test('readRangeImage returns null for an unknown Range id', async ({ db }) => {
  expect(await readRangeImage(fakeStorage(), db, crypto.randomUUID())).toBeNull();
});

test('readRangeImage returns null for a malformed id rather than querying', async ({ db }) => {
  expect(await readRangeImage(fakeStorage(), db, 'not-a-uuid')).toBeNull();
});

test('readProductImageSlot streams the requested Product image slot', async ({ db }) => {
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
        primary: {
          byteSize: 1,
          contentType: 'image/png',
          storageKey: primaryKey,
          updatedAt: new Date().toISOString(),
        },
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

  const secondaryObject: StoredObject = { body: bytesOf(new Uint8Array([2])), byteSize: 1, contentType: 'image/jpeg' };
  const result = await readProductImageSlot(
    fakeStorage({
      [primaryKey]: { body: bytesOf(new Uint8Array([1])), byteSize: 1, contentType: 'image/png' },
      [secondaryKey]: secondaryObject,
    }),
    db,
    product.id,
    'secondary1',
  );

  expect(result?.contentType).toBe('image/jpeg');
});

test('readProductImageSlot falls back to primary when the requested slot is missing or invalid', async ({ db }) => {
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
        primary: {
          byteSize: 1,
          contentType: 'image/png',
          storageKey: primaryKey,
          updatedAt: new Date().toISOString(),
        },
      },
      modelCode: `IMG-FALLBACK-${suffix}`,
      name: `Lander Product Fallback ${suffix}`,
      rangeId: range.id,
    })
    .returning();
  if (!product) throw new Error('product insert did not return a row');

  const storage = fakeStorage({
    [primaryKey]: { body: bytesOf(new Uint8Array([1])), byteSize: 1, contentType: 'image/png' },
  });

  expect((await readProductImageSlot(storage, db, product.id))?.contentType).toBe('image/png');
  expect((await readProductImageSlot(storage, db, product.id, 'not-a-slot'))?.contentType).toBe('image/png');
});

test('readProductImageSlot returns null for an unknown Product id', async ({ db }) => {
  expect(await readProductImageSlot(fakeStorage(), db, crypto.randomUUID())).toBeNull();
});
