import {
  ImageNotFoundError,
  ProductNotFoundError,
  ProductRangeNotFoundError,
  readProductImage,
  readProductRangeImage,
  type StorageAdapter,
  StorageObjectNotFoundError,
  type StoredObject,
} from '@pkg/core';
import type { Db } from '@pkg/db';
import { ProductImageSlot, type ProductImageSlot as ProductImageSlotName, UUID } from '@pkg/schema';

const DEFAULT_PRODUCT_IMAGE_SLOT: ProductImageSlotName = 'primary';

// Read a Range's presentation image, or null when there is nothing to show. "Nothing to show" covers an
// unknown/malformed id, a Range with no image set, and a stored reference whose object is gone — all of
// which the route turns into the neutral placeholder rather than an error page.
export async function readRangeImage(storage: StorageAdapter, db: Db, rangeId: string): Promise<StoredObject | null> {
  const parsed = UUID.safeParse(rangeId);
  if (!parsed.success) {
    return null;
  }

  try {
    return await readProductRangeImage({ db, rangeId: parsed.data, storage });
  } catch (error) {
    if (isMissingImageError(error)) {
      return null;
    }

    throw error;
  }
}

// Read a Product image slot, or null when there is nothing to show (see readRangeImage). Invalid slot
// input falls back to `primary` so the public image endpoint remains forgiving for crawlers and caches.
export async function readProductImageSlot(
  storage: StorageAdapter,
  db: Db,
  productId: string,
  requestedSlot?: string | null,
): Promise<StoredObject | null> {
  const parsed = UUID.safeParse(productId);
  if (!parsed.success) {
    return null;
  }

  const slot = parseProductImageSlot(requestedSlot);

  try {
    return await readProductImage({ db, productId: parsed.data, slot, storage });
  } catch (error) {
    if (isMissingImageError(error)) {
      return null;
    }

    throw error;
  }
}

function parseProductImageSlot(requestedSlot: string | null | undefined): ProductImageSlotName {
  const parsed = ProductImageSlot.safeParse(requestedSlot);

  return parsed.success ? parsed.data : DEFAULT_PRODUCT_IMAGE_SLOT;
}

function isMissingImageError(error: unknown): boolean {
  return (
    error instanceof ImageNotFoundError ||
    error instanceof StorageObjectNotFoundError ||
    error instanceof ProductRangeNotFoundError ||
    error instanceof ProductNotFoundError
  );
}
