import type { UUID } from '@pkg/schema';
import { readApiErrorMessage } from '@/equipment/utils/document.js';
import { getClientConfig } from '@/lib/app-config.js';

/**
 * Both PO PDFs are served by the API, not by the origin serving the app, so they carry the API base
 * URL like every other API-served asset (Part labels, document downloads). A relative `/api/...` path
 * lands on the web server's SPA fallback and renders Not Found.
 */
export function purchaseOrderPreviewUrl(purchaseOrderId: UUID): string {
  return `${purchaseOrderApiUrl(purchaseOrderId)}/preview`;
}

function purchaseOrderApiUrl(purchaseOrderId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}`;
}

/**
 * The preview is rendered per request and never filed as a document, so the sheet holds the bytes
 * itself rather than pointing an iframe at the route a second time.
 */
export async function fetchPurchaseOrderPreviewBlob({
  purchaseOrderId,
  signal,
}: {
  purchaseOrderId: UUID;
  signal?: AbortSignal;
}): Promise<Blob> {
  const requestInit: RequestInit = {
    // Cross-origin now, so the session cookie only rides along when the request asks for it.
    credentials: 'include',
    ...(signal ? { signal } : {}),
  };
  const response = await fetch(purchaseOrderPreviewUrl(purchaseOrderId), requestInit);

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to generate the PDF preview.'));
  }

  return response.blob();
}
