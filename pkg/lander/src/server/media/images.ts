import { type Db, eq, productRanges, products } from '@pkg/db';
import { ProductImageSlot, type ProductImageSlot as ProductImageSlotName, UUID } from '@pkg/schema';

const DEFAULT_PRODUCT_IMAGE_SLOT: ProductImageSlotName = 'primary';

// The stored-file facts the image cache needs: `storageKey` is the immutable content identity used as the
// cache key and the S3 object to fetch on a miss; `contentType` is the source type, used only if
// optimization has to fall back to serving the original bytes.
export type ResolvedImageRef = { contentType: string; storageKey: string };

// Resolve a Range's presentation image reference, or null when there is nothing to show — an unknown or
// malformed id, or a Range with no image set. A stored reference whose S3 object is gone still resolves
// here; that "object missing" case surfaces later, when the bytes are fetched, and also maps to null.
export async function resolveRangeImageRef(db: Db, rangeId: string): Promise<ResolvedImageRef | null> {
  const parsed = UUID.safeParse(rangeId);
  if (!parsed.success) {
    return null;
  }

  const [row] = await db
    .select({ image: productRanges.image })
    .from(productRanges)
    .where(eq(productRanges.id, parsed.data))
    .limit(1);

  return toRef(row?.image);
}

// Resolve a Product image slot reference, or null when there is nothing to show (see resolveRangeImageRef).
// Invalid slot input falls back to `primary` so the public endpoint stays forgiving for crawlers and caches.
export async function resolveProductImageRef(
  db: Db,
  productId: string,
  requestedSlot?: string | null,
): Promise<ResolvedImageRef | null> {
  const parsed = UUID.safeParse(productId);
  if (!parsed.success) {
    return null;
  }

  const slot = parseProductImageSlot(requestedSlot);

  const [row] = await db
    .select({ images: products.images })
    .from(products)
    .where(eq(products.id, parsed.data))
    .limit(1);

  return toRef(row?.images?.[slot]);
}

function toRef(stored: { contentType: string; storageKey: string } | null | undefined): ResolvedImageRef | null {
  return stored ? { contentType: stored.contentType, storageKey: stored.storageKey } : null;
}

function parseProductImageSlot(requestedSlot: string | null | undefined): ProductImageSlotName {
  const parsed = ProductImageSlot.safeParse(requestedSlot);

  return parsed.success ? parsed.data : DEFAULT_PRODUCT_IMAGE_SLOT;
}
