import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';

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
  return fetch(url, withSessionCookie(init, await sessionCookieHeader()));
}
