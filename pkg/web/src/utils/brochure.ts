import type { UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

import { readApiErrorMessage } from './document.js';

// Fetches the on-the-fly Brochure preview PDF (generated, never persisted) and opens it in a new tab.
// The route is gated server-side on the completeness predicate, so a failure surfaces its message.
export async function previewProductBrochure(productId: UUID): Promise<void> {
  // Open the tab synchronously, while the click's user activation is still live. Rendering the PDF takes
  // a moment, and a `window.open` that runs only after the await is rejected by stricter popup blockers.
  const previewTab = window.open('about:blank', '_blank');

  try {
    const response = await fetch(brochurePreviewUrl(productId), { credentials: 'include' });

    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response, 'Unable to generate the brochure preview.'));
    }

    const url = URL.createObjectURL(await response.blob());

    if (previewTab) {
      // Sever the opener link before navigating the controlled blob URL into the tab.
      previewTab.opener = null;
      previewTab.location.href = url;
    } else {
      // Popup blocked: fall back to a download so the user still gets the PDF.
      downloadBlobUrl(url, 'brochure.pdf');
    }

    // Revoke after a delay so the opened tab (or download) has time to load the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    previewTab?.close();
    throw error;
  }
}

function downloadBlobUrl(url: string, filename: string): void {
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

function brochurePreviewUrl(productId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/products/${encodeURIComponent(productId)}/brochure-preview`;
}
