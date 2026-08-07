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
      return servePrecompressed(dir, pathname, request);
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
//
// Owning this path is also what lets it answer a conditional or partial request. srvx's `serveStatic` sends
// no validators and ignores `Range`, and the formats routed here are exactly the ones that need it: a video
// element will not play a source that answers a range request with the whole file.
async function servePrecompressed(dir: string, pathname: string, request: Request): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
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

  // Size and mtime identify these bytes closely enough to revalidate against: the build writes each file
  // exactly once. Weak, because a byte-identical rebuild moves the mtime without changing the content.
  // Truncated to whole milliseconds — `mtimeMs` carries a fraction on macOS, which would otherwise put a
  // decimal point inside the tag.
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers = new Headers({
    'accept-ranges': 'bytes',
    'cache-control': cacheControlFor(pathname),
    etag,
    'last-modified': new Date(info.mtimeMs).toUTCString(),
  });

  if (isUnmodified(request, etag, info.mtimeMs)) {
    return new Response(null, { status: 304, headers });
  }

  headers.set('content-type', PRECOMPRESSED_TYPES[extensionOf(pathname)] ?? 'application/octet-stream');

  const range = mayServePartial(request, info.mtimeMs) ? parseRange(request.headers.get('range'), info.size) : null;
  if (range === 'unsatisfiable') {
    headers.set('content-range', `bytes */${info.size}`);

    return new Response(null, { status: 416, headers });
  }

  headers.set('content-length', String(range ? range.end - range.start + 1 : info.size));
  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${info.size}`);
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  return new Response(Readable.toWeb(createReadStream(filePath, range ?? {})) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}

// True when the client already holds these bytes. `If-None-Match` wins whenever it is offered, per RFC 9110;
// `If-Modified-Since` is only consulted in its absence, at the one-second resolution an HTTP date carries.
function isUnmodified(request: Request, etag: string, mtimeMs: number): boolean {
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch) {
    return ifNoneMatch.split(',').some((candidate) => candidate.trim() === etag);
  }

  const ifModifiedSince = Date.parse(request.headers.get('if-modified-since') ?? '');

  return !Number.isNaN(ifModifiedSince) && Math.floor(mtimeMs / 1000) * 1000 <= ifModifiedSince;
}

// Whether a `Range` may be honoured at all, given the client's `If-Range` (RFC 9110 §13.1.5). A client
// resuming an interrupted download sends the validator it started with; if the file has been replaced since,
// splicing the new bytes onto the old prefix yields a file that is corrupt and reports success. When the
// validator does not still describe this representation the range must be ignored and the whole file sent.
//
// An entity-tag never matches: ours is weak, this comparison has to be strong, and a client is not permitted
// to put a weak tag here in the first place. A date matches only when it is exactly our `Last-Modified`.
// Media seeking is unaffected either way — a video element sends `Range` with no `If-Range`.
function mayServePartial(request: Request, mtimeMs: number): boolean {
  const ifRange = request.headers.get('if-range')?.trim();
  if (!ifRange) {
    return true;
  }

  if (ifRange.startsWith('"') || ifRange.startsWith('W/')) {
    return false;
  }

  const asDate = Date.parse(ifRange);

  return !Number.isNaN(asDate) && Math.floor(mtimeMs / 1000) * 1000 === asDate;
}

// A single `bytes=` range — what a media element seeking and a download resuming both send. Returns null for
// anything else, including a multi-range request: serving the whole file is always a legal answer, and the
// formats here are large rather than expensive to assemble.
function parseRange(header: string | null, size: number): { end: number; start: number } | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match || (match[1] === '' && match[2] === '')) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  // `bytes=-500` asks for the final 500 bytes rather than naming an offset.
  const suffixRange = rawStart === '';
  const start = suffixRange ? Math.max(0, size - Number(rawEnd)) : Number(rawStart);
  const end = suffixRange || rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);

  return start > end || start >= size ? 'unsatisfiable' : { end, start };
}

function safeRelativePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    // A malformed percent-escape is never a file we ship.
    return '';
  }
}
