import { IMAGE_ACCEPT, imageContentTypeRejectedMessage, imageTooLargeMessage } from '@pkg/domain';
import { BROCHURE_IMAGE_MAX_BYTES, type BrochureImageSlot, IMAGE_CONTENT_TYPES, Product, type UUID } from '@pkg/schema';
import { toast } from 'sonner';

import { getClientConfig } from '@/lib/app-config.js';

import { readApiErrorMessage } from './document.js';

export { IMAGE_ACCEPT };

const ALLOWED_CONTENT_TYPES = new Set<string>(IMAGE_CONTENT_TYPES);

// Client-side guard mirroring the server policy so an obviously wrong file is rejected before upload.
// The server re-validates by sniffing the bytes, so this is UX only.
export function validateSelectedBrochureImage(file: File | null): File | null {
  if (!file) return null;

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    toast.error(imageContentTypeRejectedMessage(IMAGE_CONTENT_TYPES));
    return null;
  }

  if (file.size > BROCHURE_IMAGE_MAX_BYTES) {
    toast.error(imageTooLargeMessage(BROCHURE_IMAGE_MAX_BYTES));
    return null;
  }

  return file;
}

export async function uploadProductBrochureImage(
  productId: UUID,
  slot: BrochureImageSlot,
  file: File,
): Promise<Product> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(brochureImageUrl(productId, slot), {
    body: formData,
    credentials: 'include',
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to upload image.'));
  }

  return Product.parse(await response.json());
}

export async function fetchProductBrochureImageBlob({
  productId,
  signal,
  slot,
}: {
  productId: UUID;
  signal?: AbortSignal;
  slot: BrochureImageSlot;
}): Promise<Blob> {
  const response = await fetch(`${brochureImageUrl(productId, slot)}/download`, {
    credentials: 'include',
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to load image.'));
  }

  return response.blob();
}

function brochureImageUrl(productId: UUID, slot: BrochureImageSlot): string {
  return `${getClientConfig().apiBaseUrl}/api/products/${encodeURIComponent(productId)}/brochure-images/${slot}`;
}
