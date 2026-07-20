import { randomUUID } from 'node:crypto';

import { type Db, notRemoved, products, type StoredFile } from '@pkg/db';
import { PRODUCT_IMAGE_POLICY } from '@pkg/domain';
import type { AuthId, Product, ProductImageSlot, UUID } from '@pkg/schema';
import { and, eq } from 'drizzle-orm';

import { recordAuditEvent } from '../audit/audit-service.js';
import {
  readStoredObject,
  type StorageAdapter,
  type StoredObject,
  storedObjectFromBytes,
} from '../documents/storage-adapter.js';
import { FileNotFoundError } from '../files/file-errors.js';
import { fileExtensionFor, replaceFile } from '../files/stored-file-service.js';
import { type ImageCacheOptions, readOptimizedImage } from '../media/image-cache.js';
import { ProductNotFoundError } from './product-errors.js';
import { getProduct, productAuditDescriptor } from './product-service.js';

export type ReplaceProductImageInput = {
  bytes: Uint8Array;
  productId: UUID;
  slot: ProductImageSlot;
};

// Replace a single Product image slot in place, then return the updated Product. The generic stored-file
// service owns validation, storage, and old-object cleanup; this binding owns the Product specifics:
// locking the row, swapping the slot's reference, and recording the replacement as a change-of-fact in
// the Product audit trail (image bytes are never diffed — the storage-key swap is the recorded change).
export async function replaceProductImage({
  actorUserId,
  db,
  input,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: ReplaceProductImageInput;
  storage: StorageAdapter;
}): Promise<Product> {
  await replaceFile({
    bytes: input.bytes,
    db,
    policy: PRODUCT_IMAGE_POLICY,
    storage,
    binding: {
      buildStorageKey: ({ contentType }) =>
        `product-images/product/${input.productId}/${input.slot}/${randomUUID()}.${fileExtensionFor(contentType)}`,
      apply: async ({ nextRef, tx }) => {
        const [before] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, input.productId), notRemoved(products)))
          .for('update');

        if (!before) {
          throw new ProductNotFoundError(input.productId);
        }

        const priorRef = before.images[input.slot];

        await tx
          .update(products)
          .set({
            images: { ...before.images, [input.slot]: nextRef },
            updatedAt: new Date(),
          })
          .where(eq(products.id, input.productId));

        await recordAuditEvent({
          db: tx,
          descriptor: productAuditDescriptor,
          action: 'updated',
          actorUserId,
          entityId: input.productId,
          changes: {
            [`image:${input.slot}`]: { from: priorRef?.storageKey ?? null, to: nextRef.storageKey },
          },
          record: { name: before.name },
        });

        return { previousStorageKey: priorRef?.storageKey ?? null };
      },
    },
  });

  return getProduct({ db, id: input.productId });
}

export async function readProductImage({
  db,
  productId,
  slot,
  storage,
}: {
  db: Db;
  productId: UUID;
  slot: ProductImageSlot;
  storage: StorageAdapter;
}): Promise<StoredObject> {
  const ref = await readProductImageReference({ db, productId, slot });

  return storage.get(ref.storageKey);
}

export async function readMobileProductImage({
  cache,
  db,
  productId,
  slot,
  storage,
}: {
  cache: ImageCacheOptions;
  db: Db;
  productId: UUID;
  slot: ProductImageSlot;
  storage: StorageAdapter;
}): Promise<StoredObject> {
  const ref = await readProductImageReference({ db, productId, slot });
  const optimized = await readOptimizedImage(cache, ref.storageKey, 'mobileWebp', () =>
    readStoredObject(storage, ref.storageKey),
  );

  return storedObjectFromBytes(optimized.body, optimized.contentType);
}

// Returns the immutable storage reference without reading its object. Optimized consumers use the key as
// their cache identity and defer storage.get until the shared image cache reports a miss.
export async function readProductImageReference({
  db,
  productId,
  slot,
}: {
  db: Db;
  productId: UUID;
  slot: ProductImageSlot;
}): Promise<StoredFile> {
  const [row] = await db
    .select({ images: products.images })
    .from(products)
    .where(and(eq(products.id, productId), notRemoved(products)))
    .limit(1);

  if (!row) {
    throw new ProductNotFoundError(productId);
  }

  const ref = row.images[slot];

  if (!ref) {
    throw new FileNotFoundError(`Product image not found for slot ${slot} on product ${productId}`, {
      productId,
      slot,
    });
  }

  return ref;
}
