import { IMAGE_ACCEPT } from '@pkg/domain';
import { BROCHURE_IMAGE_MAX_BYTES, type BrochureImageSlot, Product, type UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

import { fetchCredentialedImageBlob, uploadImageMultipart, validateSelectedImage } from './entity-image.js';

export { IMAGE_ACCEPT };

export function validateSelectedBrochureImage(file: File | null): File | null {
  return validateSelectedImage(file, BROCHURE_IMAGE_MAX_BYTES);
}

export async function uploadProductBrochureImage(
  productId: UUID,
  slot: BrochureImageSlot,
  file: File,
): Promise<Product> {
  return Product.parse(await uploadImageMultipart(brochureImageUrl(productId, slot), file));
}

export function fetchProductBrochureImageBlob({
  productId,
  signal,
  slot,
}: {
  productId: UUID;
  signal?: AbortSignal;
  slot: BrochureImageSlot;
}): Promise<Blob> {
  return fetchCredentialedImageBlob(`${brochureImageUrl(productId, slot)}/download`, signal);
}

function brochureImageUrl(productId: UUID, slot: BrochureImageSlot): string {
  return `${getClientConfig().apiBaseUrl}/api/products/${encodeURIComponent(productId)}/brochure-images/${slot}`;
}
