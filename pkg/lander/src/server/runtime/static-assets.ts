import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { serveStatic } from 'srvx/static';

// srvx's own `--static` middleware serves the build output with no `Cache-Control` at all, so every asset
// is revalidated on every visit, and it compresses every response — including images and fonts, formats
// that arrive compressed, where the round of zlib costs CPU, saves nothing, and drops the `Content-Length`
// the browser wants for scheduling. Serving the directory ourselves is what lets us fix both.

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

// Formats that carry their own compression, mapped to the type they are served as. Membership here routes
// a request down the uncompressed path below.
const PRECOMPRESSED_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
};

export function cacheControlFor(pathname: string): string {
  if (pathname.endsWith('.html') || !extensionOf(pathname)) {
    return DOCUMENT_CACHE_CONTROL;
  }

  return pathname.startsWith(HASHED_ASSET_PREFIX) ? IMMUTABLE_CACHE_CONTROL : STATIC_CACHE_CONTROL;
}

export function isPrecompressed(pathname: string): boolean {
  return extensionOf(pathname) in PRECOMPRESSED_TYPES;
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
  const dir = fileURLToPath(clientDirUrl).replace(/\/?$/, sep);
  // Handles the compressible formats — CSS, JS, SVG, JSON — where srvx's on-the-fly gzip/brotli is worth
  // having. Nothing upstream compresses for us.
  const compressibleHandler = serveStatic({ dir });

  return async (request) => {
    const { pathname } = new URL(request.url);

    if (isPrecompressed(pathname)) {
      return servePrecompressed(dir, pathname, request.method);
    }

    let matched = true;
    const response = await compressibleHandler(request, () => {
      matched = false;

      return new Response(null, { status: 404 });
    });

    if (!matched) {
      return null;
    }

    const headers = new Headers(response.headers);
    headers.set('cache-control', cacheControlFor(pathname));

    return new Response(response.body, { status: response.status, headers });
  };
}

// Streams an already-compressed file as-is. Kept separate from srvx's handler rather than talking it out of
// compressing: its middleware decides that from the request's `accept-encoding`, and a request rebuilt
// without that header cannot be handed back to it — the server's Request and Headers classes are its own,
// and the platform constructors reject them.
async function servePrecompressed(dir: string, pathname: string, method: string): Promise<Response | null> {
  if (method !== 'GET' && method !== 'HEAD') {
    return null;
  }

  const filePath = join(dir, safeRelativePath(pathname));
  // `join` normalises away `..`, so a traversal attempt lands outside the root and is caught here.
  if (!filePath.startsWith(dir)) {
    return null;
  }

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    return null;
  }

  const headers = {
    'cache-control': cacheControlFor(pathname),
    'content-length': String(info.size),
    'content-type': PRECOMPRESSED_TYPES[extensionOf(pathname)] ?? 'application/octet-stream',
  };

  if (method === 'HEAD') {
    return new Response(null, { headers });
  }

  return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>, { headers });
}

function safeRelativePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    // A malformed percent-escape is never a file we ship.
    return '';
  }
}
