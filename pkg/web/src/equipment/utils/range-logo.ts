import { ProductRange, RANGE_LOGO_MAX_BYTES, type UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

import {
  fetchCredentialedImageBlob,
  IMAGE_ACCEPT,
  uploadImageMultipart,
  validateSelectedImage,
} from './entity-image.js';

export { IMAGE_ACCEPT };

export function validateSelectedRangeLogo(file: File | null): File | null {
  return validateSelectedImage(file, RANGE_LOGO_MAX_BYTES);
}

export async function uploadProductRangeLogo(rangeId: UUID, file: File): Promise<ProductRange> {
  return ProductRange.parse(await uploadImageMultipart(rangeLogoUrl(rangeId), file));
}

export function fetchProductRangeLogoBlob({ rangeId, signal }: { rangeId: UUID; signal?: AbortSignal }): Promise<Blob> {
  return fetchCredentialedImageBlob(`${rangeLogoUrl(rangeId)}/download`, signal);
}

function rangeLogoUrl(rangeId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/product-ranges/${encodeURIComponent(rangeId)}/logo`;
}
