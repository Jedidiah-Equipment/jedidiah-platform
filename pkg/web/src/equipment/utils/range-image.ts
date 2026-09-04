import type { UUID } from '@pkg/schema';
import { ProductRange, RANGE_IMAGE_MAX_BYTES } from '@pkg/schema/equipment';

import { getClientConfig } from '@/lib/app-config.js';

import {
  fetchCredentialedImageBlob,
  IMAGE_ACCEPT,
  uploadImageMultipart,
  validateSelectedImage,
} from './entity-image.js';

export { IMAGE_ACCEPT };

export function validateSelectedRangeImage(file: File | null): File | null {
  return validateSelectedImage(file, RANGE_IMAGE_MAX_BYTES);
}

export async function uploadProductRangeImage(rangeId: UUID, file: File): Promise<ProductRange> {
  return ProductRange.parse(await uploadImageMultipart(rangeImageUrl(rangeId), file));
}

export function fetchProductRangeImageBlob({
  rangeId,
  signal,
}: {
  rangeId: UUID;
  signal?: AbortSignal;
}): Promise<Blob> {
  return fetchCredentialedImageBlob(`${rangeImageUrl(rangeId)}/download`, signal);
}

function rangeImageUrl(rangeId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/product-ranges/${encodeURIComponent(rangeId)}/image`;
}
