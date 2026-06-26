import { PRODUCT_IMAGE_MAX_BYTES, Product, type ProductImageSlot, type UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

import {
  fetchCredentialedImageBlob,
  IMAGE_ACCEPT,
  uploadImageMultipart,
  validateSelectedImage,
} from './entity-image.js';

export { IMAGE_ACCEPT };

export function validateSelectedProductImage(file: File | null): File | null {
  return validateSelectedImage(file, PRODUCT_IMAGE_MAX_BYTES);
}

export async function uploadProductImage(productId: UUID, slot: ProductImageSlot, file: File): Promise<Product> {
  return Product.parse(await uploadImageMultipart(productImageUrl(productId, slot), file));
}

export function fetchProductImageBlob({
  productId,
  signal,
  slot,
}: {
  productId: UUID;
  signal?: AbortSignal;
  slot: ProductImageSlot;
}): Promise<Blob> {
  return fetchCredentialedImageBlob(`${productImageUrl(productId, slot)}/download`, signal);
}

function productImageUrl(productId: UUID, slot: ProductImageSlot): string {
  return `${getClientConfig().apiBaseUrl}/api/products/${encodeURIComponent(productId)}/images/${slot}`;
}
