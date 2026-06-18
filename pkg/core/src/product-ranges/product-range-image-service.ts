import { randomUUID } from 'node:crypto';

import { type Db, productRanges } from '@pkg/db';
import { RANGE_IMAGE_POLICY } from '@pkg/domain';
import type { ProductRange, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import type { StorageAdapter, StoredObject } from '../documents/storage-adapter.js';
import { ImageNotFoundError } from '../images/image-errors.js';
import { imageExtensionFor, replaceImage } from '../images/image-service.js';
import { ProductRangeNotFoundError } from './product-range-errors.js';
import { getProductRange } from './product-range-service.js';

export type ReplaceProductRangeImageInput = {
  bytes: Uint8Array;
  rangeId: UUID;
};

// Replace the Range's single presentation image in place, then return the updated Range. The generic
// image service owns validation, storage, and old-object cleanup; this binding owns the Range specifics:
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
  await replaceImage({
    bytes: input.bytes,
    db,
    policy: RANGE_IMAGE_POLICY,
    storage,
    binding: {
      buildStorageKey: ({ contentType }) =>
        `range-images/product-range/${input.rangeId}/${randomUUID()}.${imageExtensionFor(contentType)}`,
      apply: async ({ nextRef, tx }) => {
        const [before] = await tx.select().from(productRanges).where(eq(productRanges.id, input.rangeId)).for('update');

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
    .where(eq(productRanges.id, rangeId))
    .limit(1);

  if (!row) {
    throw new ProductRangeNotFoundError(rangeId);
  }

  if (!row.image) {
    throw new ImageNotFoundError(`Image not found for product range ${rangeId}`, { rangeId });
  }

  return storage.get(row.image.storageKey);
}
