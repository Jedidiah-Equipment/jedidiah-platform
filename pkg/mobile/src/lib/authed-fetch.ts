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
