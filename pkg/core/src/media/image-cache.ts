import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { optimizeImage } from './image-optimizer.js';
import {
  IMAGE_TRANSFORMS,
  type ImageTransformName,
  imageFormatForTransform,
  transformSignature,
} from './image-transform.js';

// The optimized bytes to serve, already resolved from disk or freshly produced. Optimized catalog
// images are small and sharp needs the whole source in memory, so streaming here would not reduce memory.
export type OptimizedImage = { body: Uint8Array; byteSize: number; contentType: string };

// The raw source is loaded lazily so a cache hit never touches object storage. Its content type is used
// only when corrupt or unsupported bytes must fall back to the original object.
export type LoadedImage = { bytes: Uint8Array; contentType: string };

export type ImageCacheOptions = {
  cacheDir: string;
  // Injectable at the system boundary so callers can prove cache behavior without invoking sharp.
  optimize?: (bytes: Uint8Array, transformName: ImageTransformName) => Promise<Buffer>;
};

// Per-process coalescing of concurrent misses for the same cache file. Entries clear when work settles.
const inFlight = new Map<string, Promise<OptimizedImage>>();

// Storage keys are immutable: replacing an image yields a new key, so cache invalidation needs no mutable
// state. The loader stays lazy because cache hits must not read private object storage.
export async function readOptimizedImage(
  options: ImageCacheOptions,
  storageKey: string,
  transformName: ImageTransformName,
  load: () => Promise<LoadedImage>,
): Promise<OptimizedImage> {
  const cachePath = cachePathFor(options.cacheDir, storageKey, transformName);

  const cached = await readCached(cachePath, transformName);
  if (cached) {
    return cached;
  }

  const existing = inFlight.get(cachePath);
  if (existing) {
    return existing;
  }

  const work = produce(options, cachePath, transformName, load).finally(() => inFlight.delete(cachePath));
  inFlight.set(cachePath, work);

  return work;
}

function cachePathFor(cacheDir: string, storageKey: string, transformName: ImageTransformName): string {
  const hash = createHash('sha256')
    .update(`${storageKey}:${transformSignature(transformName)}`)
    .digest('hex');

  return path.join(cacheDir, `${hash}.${imageFormatForTransform(transformName)}`);
}

async function readCached(cachePath: string, transformName: ImageTransformName): Promise<OptimizedImage | null> {
  try {
    const body = await readFile(cachePath);

    return { body, byteSize: body.byteLength, contentType: IMAGE_TRANSFORMS[transformName].contentType };
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
  transformName: ImageTransformName,
  load: () => Promise<LoadedImage>,
): Promise<OptimizedImage> {
  // Re-check under the in-flight guard: another worker sharing the directory may have filled the cache.
  const cached = await readCached(cachePath, transformName);
  if (cached) {
    return cached;
  }

  // Missing source objects still propagate. Only optimization failures for present objects fall back.
  const loaded = await load();
  const optimize = options.optimize ?? optimizeImage;

  let optimized: Buffer;
  try {
    optimized = await optimize(loaded.bytes, transformName);
  } catch (error) {
    console.warn(`[media] image optimization failed for ${cachePath}; serving original bytes`, error);

    return { body: loaded.bytes, byteSize: loaded.bytes.byteLength, contentType: loaded.contentType };
  }

  await writeAtomic(cachePath, optimized);

  return {
    body: optimized,
    byteSize: optimized.byteLength,
    contentType: IMAGE_TRANSFORMS[transformName].contentType,
  };
}

// A unique temp file plus same-filesystem rename ensures readers only observe complete cache entries.
async function writeAtomic(cachePath: string, body: Uint8Array): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, body);
  await rename(tempPath, cachePath);
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
