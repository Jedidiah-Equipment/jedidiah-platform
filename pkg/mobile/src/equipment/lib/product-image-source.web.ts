import { apiBaseUrl } from '@/lib/api-base-url';
import { productImageDownloadPath } from '@/lib/authed-fetch';

import type { ProductImageKey } from './product-image-cache';
import type { ProductImageSource } from './product-image-source';

/** Browser HTTP caching owns Product images on web; the native file cache must not enter this bundle. */
export function useProductImageSource(key: ProductImageKey): ProductImageSource {
  return {
    kind: 'ready',
    uri: `${apiBaseUrl}${productImageDownloadPath(key.productId, key.slot, key.updatedAt)}`,
  };
}
