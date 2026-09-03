import { randomUUID } from 'node:crypto';

import { type Db, notRemoved, productRanges } from '@pkg/db';
import { RANGE_IMAGE_POLICY, RANGE_LOGO_POLICY } from '@pkg/domain';
import type { ProductRange, UUID } from '@pkg/schema';
import { and, eq } from 'drizzle-orm';

import type { StorageAdapter, StoredObject } from '../documents/storage-adapter.js';
import { FileNotFoundError } from '../files/file-errors.js';
import { fileExtensionFor, replaceFile } from '../files/stored-file-service.js';
import { ProductRangeNotFoundError } from './product-range-errors.js';
import { getProductRange } from './product-range-service.js';

export type ReplaceProductRangeImageInput = {
  bytes: Uint8Array;
  rangeId: UUID;
};

// Replace the Range's single presentation image in place, then return the updated Range. The generic
// stored-file service owns validation, storage, and old-object cleanup; this binding owns the Range specifics:
// locking the row and swapping its `image` reference. Range image changes are not audited (creating or
// renaming a Range is not audited either), so the binding records nothing.
export async function replaceProductRangeImage({
  db,
  input,
  storage,
}: {
  db: Db;
  input: ReplaceProductRangeImageInput;
  storage: StorageAdapter;
}): Promise<ProductRange> {
  await replaceFile({
    bytes: input.bytes,
    db,
    policy: RANGE_IMAGE_POLICY,
    storage,
    binding: {
      buildStorageKey: ({ contentType }) =>
        `range-images/product-range/${input.rangeId}/${randomUUID()}.${fileExtensionFor(contentType)}`,
      apply: async ({ nextRef, tx }) => {
        const [before] = await tx
          .select()
          .from(productRanges)
          .where(and(eq(productRanges.id, input.rangeId), notRemoved(productRanges)))
          .for('update');

        if (!before) {
          throw new ProductRangeNotFoundError(input.rangeId);
        }

        await tx
          .update(productRanges)
          .set({ image: nextRef, updatedAt: new Date() })
          .where(eq(productRanges.id, input.rangeId));

        return { previousStorageKey: before.image?.storageKey ?? null };
      },
    },
  });

  return getProductRange({ db, id: input.rangeId });
}

export async function readProductRangeImage({
  db,
  rangeId,
  storage,
}: {
  db: Db;
  rangeId: UUID;
  storage: StorageAdapter;
}): Promise<StoredObject> {
  const [row] = await db
    .select({ image: productRanges.image })
    .from(productRanges)
    .where(and(eq(productRanges.id, rangeId), notRemoved(productRanges)))
    .limit(1);

  if (!row) {
    throw new ProductRangeNotFoundError(rangeId);
  }

  if (!row.image) {
    throw new FileNotFoundError(`Image not found for product range ${rangeId}`, { rangeId });
  }

  return storage.get(row.image.storageKey);
}

export type ReplaceProductRangeLogoInput = {
  bytes: Uint8Array;
  rangeId: UUID;
};

// Replace the Range's brochure logo in place, then return the updated Range. Mirrors
// {@link replaceProductRangeImage} but swaps the `logo` reference. Like the image, logo changes are not
// audited.
export async function replaceProductRangeLogo({
  db,
  input,
  storage,
}: {
  db: Db;
  input: ReplaceProductRangeLogoInput;
  storage: StorageAdapter;
}): Promise<ProductRange> {
  await replaceFile({
    bytes: input.bytes,
    db,
    policy: RANGE_LOGO_POLICY,
    storage,
    binding: {
      buildStorageKey: ({ contentType }) =>
        `range-logos/product-range/${input.rangeId}/${randomUUID()}.${fileExtensionFor(contentType)}`,
      apply: async ({ nextRef, tx }) => {
        const [before] = await tx
          .select()
          .from(productRanges)
          .where(and(eq(productRanges.id, input.rangeId), notRemoved(productRanges)))
          .for('update');

        if (!before) {
          throw new ProductRangeNotFoundError(input.rangeId);
        }

        await tx
          .update(productRanges)
          .set({ logo: nextRef, updatedAt: new Date() })
          .where(eq(productRanges.id, input.rangeId));

        return { previousStorageKey: before.logo?.storageKey ?? null };
      },
    },
  });

  return getProductRange({ db, id: input.rangeId });
}

export async function readProductRangeLogo({
  db,
  rangeId,
  storage,
}: {
  db: Db;
  rangeId: UUID;
  storage: StorageAdapter;
}): Promise<StoredObject> {
  const [row] = await db
    .select({ logo: productRanges.logo })
    .from(productRanges)
    .where(and(eq(productRanges.id, rangeId), notRemoved(productRanges)))
    .limit(1);

  if (!row) {
    throw new ProductRangeNotFoundError(rangeId);
  }

  if (!row.logo) {
    throw new FileNotFoundError(`Logo not found for product range ${rangeId}`, { rangeId });
  }

  return storage.get(row.logo.storageKey);
}
