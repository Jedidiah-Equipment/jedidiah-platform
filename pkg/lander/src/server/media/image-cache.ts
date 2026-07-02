import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { optimizeImage } from './image-optimizer.js';
import { IMAGE_TRANSFORMS, type OptimizedImageFormat, transformSignature } from './image-transform.js';

// The optimized bytes to serve, already resolved (from disk or freshly produced). `body` is a full buffer,
// not a stream: optimized catalog images are small (tens of KB) and sharp needs the whole source in memory
// anyway, so streaming buys nothing.
export type OptimizedImage = { body: Uint8Array; byteSize: number; contentType: string };

// The raw source, loaded lazily so a cache hit never touches object storage. `contentType` is only used
// for the fallback path, where the original bytes are served because optimization could not run.
export type LoadedImage = { bytes: Uint8Array; contentType: string };

export type ImageCacheOptions = {
  cacheDir: string;
  // Injectable for tests; production uses the sharp-backed default.
  optimize?: (bytes: Uint8Array, format: OptimizedImageFormat) => Promise<Buffer>;
};

// Per-process coalescing of concurrent misses for the same cache file, so a burst (a card grid, a crawler)
// runs one optimization instead of N. Keyed by cache path; entries clear as soon as the work settles.
const inFlight = new Map<string, Promise<OptimizedImage>>();

// Resolve the optimized variant for a stored object identified by its immutable S3 storage key. On a hit
// the cached file is streamed and `load` is never called; on a miss the source is loaded, optimized, and
// written atomically before being returned. The storage key changes whenever the underlying image is
// replaced, so a cached file can never be served for the wrong bytes.
export async function readOptimizedImage(
  options: ImageCacheOptions,
  storageKey: string,
  format: OptimizedImageFormat,
  load: () => Promise<LoadedImage>,
): Promise<OptimizedImage> {
  const cachePath = cachePathFor(options.cacheDir, storageKey, format);

  const cached = await readCached(cachePath, format);
  if (cached) {
    return cached;
  }

  const existing = inFlight.get(cachePath);
  if (existing) {
    return existing;
  }

  const work = produce(options, cachePath, format, load).finally(() => inFlight.delete(cachePath));
  inFlight.set(cachePath, work);

  return work;
}

// Cache filename is a hash of the storage key and the transform signature: the storage key pins the exact
// source bytes, the signature pins the exact transform (including format). Either changing yields a
// different file.
function cachePathFor(cacheDir: string, storageKey: string, format: OptimizedImageFormat): string {
  const hash = createHash('sha256')
    .update(`${storageKey}:${transformSignature(format)}`)
    .digest('hex');

  return path.join(cacheDir, `${hash}.${format}`);
}

async function readCached(cachePath: string, format: OptimizedImageFormat): Promise<OptimizedImage | null> {
  try {
    const body = await readFile(cachePath);

    return { body, byteSize: body.byteLength, contentType: IMAGE_TRANSFORMS[format].contentType };
  } catch (error) {
    if (isFileNotFound(error)) {
      return null;
    }

    throw error;
  }
}

async function produce(
  options: ImageCacheOptions,
  cachePath: string,
  format: OptimizedImageFormat,
  load: () => Promise<LoadedImage>,
): Promise<OptimizedImage> {
  // Re-check under the in-flight guard: a concurrent worker (or another instance sharing the dir) may have
  // written the file between the initial miss and acquiring this slot.
  const cached = await readCached(cachePath, format);
  if (cached) {
    return cached;
  }

  // A missing source object throws here (StorageObjectNotFoundError) and propagates: that is "nothing to
  // show", which the caller renders as the placeholder, not an optimization fallback.
  const loaded = await load();
  const optimize = options.optimize ?? optimizeImage;

  let optimized: Buffer;
  try {
    optimized = await optimize(loaded.bytes, format);
  } catch (error) {
    // Optimization failed on an otherwise-present object (corrupt bytes, unsupported source). Serve the
    // original bytes so a working photo never becomes broken, and do not cache — a later fix/redeploy retries.
    console.warn(`[lander] image optimization failed for ${cachePath}; serving original bytes`, error);

    return { body: loaded.bytes, byteSize: loaded.bytes.byteLength, contentType: loaded.contentType };
  }

  await writeAtomic(cachePath, optimized);

  return { body: optimized, byteSize: optimized.byteLength, contentType: IMAGE_TRANSFORMS[format].contentType };
}

// Write to a unique temp file then rename into place. Rename is atomic on the same filesystem, so a reader
// only ever sees a complete file — never a half-written one from a concurrent miss.
async function writeAtomic(cachePath: string, body: Uint8Array): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, body);
  await rename(tempPath, cachePath);
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
