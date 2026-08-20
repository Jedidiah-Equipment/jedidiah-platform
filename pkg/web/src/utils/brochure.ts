import type { UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

import { readApiErrorMessage } from './document.js';

export async function fetchProductBrochurePreviewBlob({
  productId,
  signal,
}: {
  productId: UUID;
  signal?: AbortSignal;
}): Promise<Blob> {
  const requestInit: RequestInit = {
    credentials: 'include',
    ...(signal ? { signal } : {}),
  };
  const response = await fetch(brochurePreviewUrl(productId), requestInit);

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to generate the brochure preview.'));
  }

  return response.blob();
}

function brochurePreviewUrl(productId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/products/${encodeURIComponent(productId)}/brochure-preview`;
}
