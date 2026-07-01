import { StorageObjectNotFoundError } from '@pkg/core';
import { getDb } from '../runtime/db.js';
import { getImageCacheDir } from '../runtime/env.js';
import { getStorage } from '../runtime/storage.js';
import { type LoadedImage, readOptimizedImage } from './image-cache.js';
import { imageResponse } from './image-response.js';
import { type ResolvedImageRef, resolveProductImageRef, resolveRangeImageRef } from './images.js';

// Server-only orchestration shared by the public image routes: resolve the image reference, serve an
// optimized (downscaled WebP) copy through the local cache, and fall back to the neutral placeholder when
// there is nothing to show. Kept out of the route modules so the route tree, which the client bundle
// imports, never pulls in @pkg/core, the S3 client, or sharp. `versioned` reflects whether the request
// carried the `?v=` cache-busting token and drives the response cache window.
export async function serveRangeImage(rangeId: string, options: { versioned: boolean }): Promise<Response> {
  return serve(await resolveRangeImageRef(getDb(), rangeId), options);
}

export async function serveProductImage(
  productId: string,
  slot: string | null | undefined,
  options: { versioned: boolean },
): Promise<Response> {
  return serve(await resolveProductImageRef(getDb(), productId, slot), options);
}

async function serve(ref: ResolvedImageRef | null, options: { versioned: boolean }): Promise<Response> {
  if (!ref) {
    return imageResponse(null, options);
  }

  try {
    const optimized = await readOptimizedImage({ cacheDir: getImageCacheDir() }, ref.storageKey, () => loadImage(ref));

    return imageResponse(optimized, options);
  } catch (error) {
    // The reference exists but its S3 object is gone (e.g. mid-replacement). Show the placeholder rather
    // than a broken image or an error page — the same treatment as a Range/Product with no image at all.
    if (error instanceof StorageObjectNotFoundError) {
      return imageResponse(null, options);
    }

    throw error;
  }
}

async function loadImage(ref: ResolvedImageRef): Promise<LoadedImage> {
  const object = await getStorage().get(ref.storageKey);

  return { bytes: await collect(object.body), contentType: object.contentType };
}

async function collect(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
