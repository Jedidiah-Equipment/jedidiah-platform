import type { ProductImageSlot } from '@pkg/schema/equipment';

export type ProductImageKey = {
  productId: string;
  slot: ProductImageSlot;
  updatedAt: string;
};

export const PRODUCT_IMAGE_CACHE_DIR = 'product-images';

/** A new upload changes `updatedAt`, so it naturally resolves to a new OS-managed cache file. */
export function productImageCacheName(key: ProductImageKey): string {
  const updatedAtMs = new Date(key.updatedAt).getTime();
  return `${key.productId}-${key.slot}-${updatedAtMs}.webp`;
}

export function productImageCachePath(cacheDir: string, key: ProductImageKey): string {
  const normalizedCacheDir = cacheDir.endsWith('/') ? cacheDir : `${cacheDir}/`;
  return `${normalizedCacheDir}${PRODUCT_IMAGE_CACHE_DIR}/${productImageCacheName(key)}`;
}
