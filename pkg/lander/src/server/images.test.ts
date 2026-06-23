import { type StorageAdapter, StorageObjectNotFoundError, type StoredObject } from '@pkg/core';
import { productRanges } from '@pkg/db';
import { expect } from 'vitest';

import { test } from '../test/tester.js';
import { readProductHeroImage, readRangeImage } from './images.js';

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
    .values({ name: `Lander Blank Image Range ${crypto.randomUUID()}`, image: null })
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

test('readProductHeroImage returns null for an unknown Product id', async ({ db }) => {
  expect(await readProductHeroImage(fakeStorage(), db, crypto.randomUUID())).toBeNull();
});
