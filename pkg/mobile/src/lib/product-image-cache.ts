import type { ProductImageSlot } from '@pkg/schema';

export type ProductImageKey = {
  productId: string;
  slot: ProductImageSlot;
  updatedAt: string;
};

/** A new upload changes `updatedAt`, so it naturally resolves to a new OS-managed cache file. */
export function productImageCachePath(cacheDir: string, key: ProductImageKey): string {
  const normalizedCacheDir = cacheDir.endsWith('/') ? cacheDir : `${cacheDir}/`;
  const updatedAtMs = new Date(key.updatedAt).getTime();

  return `${normalizedCacheDir}product-images/${key.productId}-${key.slot}-${updatedAtMs}.webp`;
}

export type ProductImageResolution = { kind: 'cached' } | { kind: 'fetch' };

export function resolveProductImage(existsInCache: boolean, _key: ProductImageKey): ProductImageResolution {
  return existsInCache ? { kind: 'cached' } : { kind: 'fetch' };
}
