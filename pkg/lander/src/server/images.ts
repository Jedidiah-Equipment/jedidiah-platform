import {
  ImageNotFoundError,
  ProductNotFoundError,
  ProductRangeNotFoundError,
  readProductBrochureImage,
  readProductRangeImage,
  type StorageAdapter,
  StorageObjectNotFoundError,
  type StoredObject,
} from '@pkg/core';
import type { Db } from '@pkg/db';
import { UUID } from '@pkg/schema';

// The brochure slot the Lander surfaces as a Product's lead image. The other slots are detail imagery
// that this public site does not render.
const HERO_SLOT = 'hero' as const;

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

// Read a Product's brochure `hero` image, or null when there is nothing to show (see readRangeImage).
export async function readProductHeroImage(
  storage: StorageAdapter,
  db: Db,
  productId: string,
): Promise<StoredObject | null> {
  const parsed = UUID.safeParse(productId);
  if (!parsed.success) {
    return null;
  }

  try {
    return await readProductBrochureImage({ db, productId: parsed.data, slot: HERO_SLOT, storage });
  } catch (error) {
    if (isMissingImageError(error)) {
      return null;
    }

    throw error;
  }
}

function isMissingImageError(error: unknown): boolean {
  return (
    error instanceof ImageNotFoundError ||
    error instanceof StorageObjectNotFoundError ||
    error instanceof ProductRangeNotFoundError ||
    error instanceof ProductNotFoundError
  );
}
