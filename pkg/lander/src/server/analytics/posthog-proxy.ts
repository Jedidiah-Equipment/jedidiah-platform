import { POSTHOG_ASSET_HOST, POSTHOG_INGEST_HOST } from '@pkg/schema';

import { resolvePosthogToken } from '../../lib/analytics-config.js';

// The Lander reverse-proxies PostHog under a same-origin `/info` prefix (mirroring @pkg/web): ingestion
// traffic (`/info/e/`, `/info/flags/`, `/info/array/<token>/config`) forwards to the ingest host, and
// loaded assets (`/info/static/...`) forward to the asset host. Same-origin requests dodge cross-origin
// blockers and need no CORS. The client points `api_host` at `/info` (see analytics.ts).

// Request headers that must not be forwarded verbatim: the upstream sets its own host/connection, and the
// body length is recomputed by fetch from the forwarded body.
const STRIPPED_REQUEST_HEADERS = ['host', 'connection', 'content-length'];

// Response headers to drop: fetch transparently decodes the upstream body, so a leftover content-encoding
// (and its now-wrong content-length) would make the browser try to decode already-decoded bytes.
const STRIPPED_RESPONSE_HEADERS = ['content-encoding', 'content-length'];

// Build the ingest upstream URL by swapping the `/info` prefix for the ingest host, preserving the query.
export function ingestUpstreamUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  const rest = url.pathname.replace(/^\/info\/?/, '');
  return `${POSTHOG_INGEST_HOST}/${rest}${url.search}`;
}

// Build the asset upstream URL: `/info/static/<rest>` maps to `<asset host>/static/<rest>`.
export function assetUpstreamUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  const rest = url.pathname.replace(/^\/info\/static\/?/, '');
  return `${POSTHOG_ASSET_HOST}/static/${rest}${url.search}`;
}

// Forward a request to an upstream PostHog host and stream the response straight back. `fetchImpl` is
// injectable so the proxy can be unit-tested without real network access.
export async function proxyRequest(
  request: Request,
  upstreamUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers(request.headers);
  for (const header of STRIPPED_REQUEST_HEADERS) {
    headers.delete(header);
  }

  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetchImpl(upstreamUrl, init);

  const responseHeaders = new Headers(upstream.headers);
  for (const header of STRIPPED_RESPONSE_HEADERS) {
    responseHeaders.delete(header);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

// 404 when PostHog is not configured, so the proxy is never an open relay in environments that opted out.
function disabledResponse(): Response {
  return new Response('Not found', { status: 404 });
}

export function proxyPosthogIngest(request: Request): Promise<Response> | Response {
  if (!resolvePosthogToken(import.meta.env)) {
    return disabledResponse();
  }
  return proxyRequest(request, ingestUpstreamUrl(request.url));
}

export function proxyPosthogAssets(request: Request): Promise<Response> | Response {
  if (!resolvePosthogToken(import.meta.env)) {
    return disabledResponse();
  }
  return proxyRequest(request, assetUpstreamUrl(request.url));
}
