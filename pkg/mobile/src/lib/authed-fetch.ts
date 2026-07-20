import type { ProductImageSlot } from '@pkg/schema';
import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';

// Fetch helper for the authed document HTTP routes (e.g. the PDF viewer in #521).
// tRPC's batch link can't stream binary bodies, so documents go over plain HTTP;
// this attaches the same better-auth session cookie that the tRPC client uses.
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = sessionCookieHeader();
  const headers = new Headers(init?.headers);
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  const url = path.startsWith('http') ? path : `${apiBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  return fetch(url, { ...init, credentials: 'include', headers });
}

/** URL of a job document's authed download route, consumed by the PDF viewer (#521). */
export function jobDocumentDownloadPath(jobId: string, documentId: string): string {
  return `/api/jobs/${jobId}/documents/${documentId}/download`;
}

/** URL of a Product document's authed download route. */
export function productDocumentDownloadPath(productId: string, documentId: string): string {
  return `/api/products/${productId}/documents/${documentId}/download`;
}

/** URL of a Quote document's authed, owner-scoped download route. */
export function quoteDocumentDownloadPath(quoteId: string, documentId: string): string {
  return `/api/quotes/${quoteId}/documents/${documentId}/download`;
}

/** URL of the generated Product Brochure preview PDF. */
export function productBrochurePreviewPath(productId: string): string {
  return `/api/products/${productId}/brochure-preview`;
}

/** URL of the small WebP variant used by Product cards and detail headers. */
export function productImageDownloadPath(productId: string, slot: ProductImageSlot, updatedAt: string): string {
  return `/api/products/${encodeURIComponent(productId)}/images/${slot}/download?variant=mobile&updatedAt=${encodeURIComponent(updatedAt)}`;
}
