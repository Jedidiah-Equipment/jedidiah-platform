import { IMAGE_ACCEPT, imageContentTypeRejectedMessage, imageTooLargeMessage } from '@pkg/domain';
import { IMAGE_CONTENT_TYPES, ProductRange, RANGE_IMAGE_MAX_BYTES, type UUID } from '@pkg/schema';
import { toast } from 'sonner';

import { getClientConfig } from '@/lib/app-config.js';

import { readApiErrorMessage } from './document.js';

export { IMAGE_ACCEPT };

const ALLOWED_CONTENT_TYPES = new Set<string>(IMAGE_CONTENT_TYPES);

// Client-side guard mirroring the server policy so an obviously wrong file is rejected before upload.
// The server re-validates by sniffing the bytes, so this is UX only.
export function validateSelectedRangeImage(file: File | null): File | null {
  if (!file) return null;

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    toast.error(imageContentTypeRejectedMessage(IMAGE_CONTENT_TYPES));
    return null;
  }

  if (file.size > RANGE_IMAGE_MAX_BYTES) {
    toast.error(imageTooLargeMessage(RANGE_IMAGE_MAX_BYTES));
    return null;
  }

  return file;
}

export async function uploadProductRangeImage(rangeId: UUID, file: File): Promise<ProductRange> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(rangeImageUrl(rangeId), {
    body: formData,
    credentials: 'include',
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to upload image.'));
  }

  return ProductRange.parse(await response.json());
}

export async function fetchProductRangeImageBlob({
  rangeId,
  signal,
}: {
  rangeId: UUID;
  signal?: AbortSignal;
}): Promise<Blob> {
  const response = await fetch(`${rangeImageUrl(rangeId)}/download`, {
    credentials: 'include',
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to load image.'));
  }

  return response.blob();
}

function rangeImageUrl(rangeId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/product-ranges/${encodeURIComponent(rangeId)}/image`;
}
