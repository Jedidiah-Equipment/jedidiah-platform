import type { UUID } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

/**
 * Both PO PDFs are served by the API, not by the origin serving the app, so they carry the API base
 * URL like every other API-served asset (Part labels, document downloads). A relative `/api/...` path
 * lands on the web server's SPA fallback and renders Not Found.
 */
export function purchaseOrderPreviewUrl(purchaseOrderId: UUID): string {
  return `${purchaseOrderApiUrl(purchaseOrderId)}/preview`;
}

export function purchaseOrderDocumentDownloadUrl(purchaseOrderId: UUID, documentId: UUID): string {
  return `${purchaseOrderApiUrl(purchaseOrderId)}/documents/${encodeURIComponent(documentId)}/download`;
}

function purchaseOrderApiUrl(purchaseOrderId: UUID): string {
  return `${getClientConfig().apiBaseUrl}/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}`;
}

export async function ensurePurchaseOrderPreview(url: string, fetcher: typeof fetch = fetch): Promise<void> {
  // Cross-origin now, so the session cookie only rides along when the request asks for it.
  const response = await fetcher(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Purchase Order preview failed with status ${response.status}`);
}
