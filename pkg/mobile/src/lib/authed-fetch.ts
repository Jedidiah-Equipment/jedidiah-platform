import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';
import { assertOnline, isKnownOffline, OfflineError } from './connectivity';

// Fetch helper for the authed document HTTP routes (e.g. the PDF viewer in #521).
// tRPC's batch link can't stream binary bodies, so documents go over plain HTTP;
// this attaches the same better-auth session cookie that the tRPC client uses.
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  assertOnline();
  const cookie = sessionCookieHeader();
  const headers = new Headers(init?.headers);
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  const url = path.startsWith('http') ? path : `${apiBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  try {
    return await fetch(url, { ...init, credentials: 'include', headers });
  } catch (error) {
    if (isKnownOffline()) {
      throw new OfflineError();
    }
    throw error;
  }
}

/** URL of a job document's authed download route, consumed by the PDF viewer (#521). */
export function jobDocumentDownloadPath(jobId: string, documentId: string): string {
  return `/api/jobs/${jobId}/documents/${documentId}/download`;
}
