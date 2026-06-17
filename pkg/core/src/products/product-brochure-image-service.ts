import { randomUUID } from 'node:crypto';

import { type Db, products } from '@pkg/db';
import { BROCHURE_IMAGE_POLICY } from '@pkg/domain';
import type { AuthId, BrochureImageSlot, Product, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { recordAuditEvent } from '../audit/audit-service.js';
import type { StorageAdapter, StoredObject } from '../documents/storage-adapter.js';
import { ImageNotFoundError } from '../images/image-errors.js';
import { replaceImage } from '../images/image-service.js';
import { ProductNotFoundError } from './product-errors.js';
import { getProduct, productAuditDescriptor } from './product-service.js';

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export type ReplaceProductBrochureImageInput = {
  bytes: Uint8Array;
  productId: UUID;
  slot: BrochureImageSlot;
};

// Replace a single Brochure image slot in place, then return the updated Product. The generic image
// service owns validation, storage, and old-object cleanup; this binding owns the Product specifics:
// locking the row, swapping the slot's reference, and recording the replacement as a change-of-fact in
// the Product audit trail (image bytes are never diffed — the storage-key swap is the recorded change).
export async function replaceProductBrochureImage({
  actorUserId,
  db,
  input,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: ReplaceProductBrochureImageInput;
  storage: StorageAdapter;
}): Promise<Product> {
  await replaceImage({
    bytes: input.bytes,
    db,
    policy: BROCHURE_IMAGE_POLICY,
    storage,
    binding: {
      buildStorageKey: ({ contentType }) =>
        `brochure-images/product/${input.productId}/${input.slot}/${randomUUID()}.${extensionFor(contentType)}`,
      apply: async ({ nextRef, tx }) => {
        const [before] = await tx.select().from(products).where(eq(products.id, input.productId)).for('update');

        if (!before) {
          throw new ProductNotFoundError(input.productId);
        }

        const priorRef = before.brochureImages[input.slot];

        await tx
          .update(products)
          .set({
            brochureImages: { ...before.brochureImages, [input.slot]: nextRef },
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
            [`brochureImage:${input.slot}`]: { from: priorRef?.storageKey ?? null, to: nextRef.storageKey },
          },
          record: { name: before.name },
        });

        return { previousStorageKey: priorRef?.storageKey ?? null };
      },
    },
  });

  return getProduct({ db, id: input.productId });
}

export async function readProductBrochureImage({
  db,
  productId,
  slot,
  storage,
}: {
  db: Db;
  productId: UUID;
  slot: BrochureImageSlot;
  storage: StorageAdapter;
}): Promise<StoredObject> {
  const [row] = await db
    .select({ brochureImages: products.brochureImages })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!row) {
    throw new ProductNotFoundError(productId);
  }

  const ref = row.brochureImages[slot];

  if (!ref) {
    throw new ImageNotFoundError(`Brochure image not found for slot ${slot} on product ${productId}`, {
      productId,
      slot,
    });
  }

  return storage.get(ref.storageKey);
}

function extensionFor(contentType: string): string {
  return CONTENT_TYPE_EXTENSIONS[contentType] ?? 'bin';
}
