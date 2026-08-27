import { fileURLToPath } from 'node:url';

import { staticMiddleware } from 'srvx/static';

// srvx serves the build output with validators, ranges and compression of its own, but its cache policy is
// a single `max-age` for the whole directory. The lander sits behind a CDN whose contract is three
// different windows, chosen from what the path is. Wrapping its middleware is what lets us say which.

// Vite writes content-hashed filenames under this prefix. Different bytes always mean a different URL, so
// these can be pinned for as long as the spec allows and never revalidated.
const HASHED_ASSET_PREFIX = '/assets/';
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
// Everything else in the build output keeps its filename across deploys — `robots.txt`, the favicon, and
// anything dropped into `public/`. It gets a day of freshness with a week of stale-while-revalidate, so a
// replacement propagates without a visitor ever blocking on the check.
const STATIC_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';
// A document is the one thing that must never be held: it is what carries a deploy's new asset URLs.
const DOCUMENT_CACHE_CONTROL = 'no-cache';

export function cacheControlFor(pathname: string): string {
  if (pathname.endsWith('.html') || !extensionOf(pathname)) {
    return DOCUMENT_CACHE_CONTROL;
  }

  return pathname.startsWith(HASHED_ASSET_PREFIX) ? IMMUTABLE_CACHE_CONTROL : STATIC_CACHE_CONTROL;
}

function extensionOf(pathname: string): string {
  const lastDot = pathname.lastIndexOf('.');
  const lastSlash = pathname.lastIndexOf('/');

  return lastDot > lastSlash ? pathname.slice(lastDot).toLowerCase() : '';
}

// Builds the asset server for a client build directory. The directory is passed in rather than derived
// here: only the server entry knows where it sits on disk, and a bundler is free to move this module.
//
// The returned function answers with a file from that directory, or null when the path matches nothing
// there and the request belongs to the SSR handler. In dev the directory does not exist — Vite serves these
// paths itself — so every request falls through.
export function createStaticAssetServer(clientDirUrl: URL): (request: Request) => Promise<Response | null> {
  // Every option is left at its default. They are the ones this module used to hand-roll: compression that
  // skips the formats arriving compressed, validators, and byte ranges.
  const staticHandler = staticMiddleware({ dir: fileURLToPath(clientDirUrl) });

  return async (request) => {
    let matched = true;
    const response = await staticHandler(request, () => {
      matched = false;

      return new Response(null, { status: 404 });
    });

    if (!matched) {
      return null;
    }

    // srvx answers a malformed percent-escape with a 400 and an out-of-bounds `Range` with a 416. Neither
    // is a representation of anything, so neither takes a freshness window — a cache told to hold one for
    // a year would answer that URL from the error long after it stopped being the truth.
    if (response.status >= 400) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set('cache-control', cacheControlFor(new URL(request.url).pathname));

    return new Response(response.body, { status: response.status, headers });
  };
}
