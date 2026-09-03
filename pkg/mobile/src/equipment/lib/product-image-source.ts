import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { authedFetch, productImageDownloadPath } from './authed-fetch';
import { type ProductImageKey, productImageCachePath } from './product-image-cache';

export type ProductImageSource = { kind: 'failed' | 'loading' } | { kind: 'ready'; uri: string };

const inFlight = new Map<string, Promise<string>>();

export function useProductImageSource(key: ProductImageKey): ProductImageSource {
  const [source, setSource] = useState<ProductImageSource>({ kind: 'loading' });
  const { productId, slot, updatedAt } = key;

  useEffect(() => {
    let active = true;

    resolveProductImageUri({ productId, slot, updatedAt })
      .then((uri) => {
        if (active) setSource({ kind: 'ready', uri });
      })
      .catch(() => {
        if (active) setSource({ kind: 'failed' });
      });

    return () => {
      active = false;
    };
  }, [productId, slot, updatedAt]);

  return source;
}

async function resolveProductImageUri(key: ProductImageKey): Promise<string> {
  const cachePath = productImageCachePath(Paths.cache.uri, key);
  const cachedFile = new File(cachePath);

  if (cachedFile.exists) {
    return cachedFile.uri;
  }

  const pending = inFlight.get(cachePath);
  if (pending) return pending;

  const request = fetchProductImage(key, cachedFile).finally(() => {
    inFlight.delete(cachePath);
  });
  inFlight.set(cachePath, request);
  return request;
}

async function fetchProductImage(key: ProductImageKey, target: File): Promise<string> {
  const cacheDirectory = new Directory(Paths.cache, 'product-images');
  cacheDirectory.create({ idempotent: true, intermediates: true });

  // Another native caller may have completed the atomic move before this request acquired the in-memory entry.
  if (target.exists) return target.uri;

  const response = await authedFetch(productImageDownloadPath(key.productId, key.slot, key.updatedAt));
  if (!response.ok) throw new Error(`Couldn’t download the Product image (${response.status}).`);

  const temporary = new File(cacheDirectory, `${target.name}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  try {
    temporary.create({ intermediates: true, overwrite: true });
    temporary.write(new Uint8Array(await response.arrayBuffer()));
    await temporary.move(target);
    return target.uri;
  } catch (error) {
    if (temporary.exists) temporary.delete();
    if (target.exists) return target.uri;
    throw error;
  }
}
