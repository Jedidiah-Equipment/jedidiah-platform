import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';
import { addBreadcrumb } from './observability';

// Attaches the same better-auth session cookie that the tRPC client uses.
// Native has no cookie jar, so the SecureStore cookie rides a header;
// `credentials: 'include'` covers react-native-web, where the browser owns the cookie.
export function withSessionCookie(init: RequestInit | undefined, cookie: string | null): RequestInit {
  const headers = new Headers(init?.headers);
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  return { ...init, credentials: 'include', headers };
}

// Fetch helper for the authed document HTTP routes (e.g. the PDF viewer in #521).
// tRPC's batch link can't stream binary bodies, so documents go over plain HTTP.
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `${apiBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const route = apiRoutePattern(new URL(url).pathname);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, withSessionCookie(init, await sessionCookieHeader()));
    addBreadcrumb('network', 'authenticated fetch', {
      durationMs: Date.now() - startedAt,
      method: init?.method ?? 'GET',
      route,
      status: response.status,
    });
    return response;
  } catch (error) {
    addBreadcrumb('network', 'authenticated fetch failed', {
      durationMs: Date.now() - startedAt,
      method: init?.method ?? 'GET',
      route,
      status: 0,
    });
    throw error;
  }
}

/** Redacts business identifiers from the small set of non-tRPC mobile API routes. */
export function apiRoutePattern(pathname: string): string {
  return pathname
    .replace(/^\/api\/jobs\/[^/]+\/documents\/[^/]+\/download$/, '/api/jobs/[jobId]/documents/[documentId]/download')
    .replace(
      /^\/api\/quotes\/[^/]+\/documents\/[^/]+\/download$/,
      '/api/quotes/[quoteId]/documents/[documentId]/download',
    )
    .replace(
      /^\/api\/products\/[^/]+\/documents\/[^/]+\/download$/,
      '/api/products/[productId]/documents/[documentId]/download',
    )
    .replace(/^\/api\/products\/[^/]+\/brochure-preview$/, '/api/products/[productId]/brochure-preview')
    .replace(/^\/api\/products\/[^/]+\/images\/[^/]+\/download$/, '/api/products/[productId]/images/[slot]/download');
}
