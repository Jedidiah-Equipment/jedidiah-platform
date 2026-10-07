import { type AuthedFileSource, useAuthedFileSource } from '@/lib/authed-file-source';
import { productImageDownloadPath } from './equipment-http-paths';
import { PRODUCT_IMAGE_CACHE_DIR, type ProductImageKey, productImageCacheName } from './product-image-cache';

export type ProductImageSource = AuthedFileSource;

export function useProductImageSource(key: ProductImageKey): ProductImageSource {
  return useAuthedFileSource({
    cacheDir: PRODUCT_IMAGE_CACHE_DIR,
    cacheName: productImageCacheName(key),
    path: productImageDownloadPath(key.productId, key.slot, key.updatedAt),
    label: 'Product image',
  });
}
