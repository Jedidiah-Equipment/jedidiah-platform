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

export async function downloadProductBrochure(productId: UUID): Promise<void> {
  const blob = await fetchProductBrochurePreviewBlob({ productId });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = 'brochure.pdf';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function brochurePreviewUrl(productId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/products/${encodeURIComponent(productId)}/brochure-preview`;
}
