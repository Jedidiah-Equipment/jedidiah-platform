import type { UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

import { readApiErrorMessage } from './document.js';

// Fetches the on-the-fly Brochure preview PDF (generated, never persisted) and opens it in a new tab.
// The route is gated server-side on the completeness predicate, so a failure surfaces its message.
export async function previewProductBrochure(productId: UUID): Promise<void> {
  const response = await fetch(brochurePreviewUrl(productId), { credentials: 'include' });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to generate the brochure preview.'));
  }

  const url = URL.createObjectURL(await response.blob());

  window.open(url, '_blank', 'noopener,noreferrer');
  // Revoke after a delay so the opened tab has time to load the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function brochurePreviewUrl(productId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/products/${encodeURIComponent(productId)}/brochure-preview`;
}
