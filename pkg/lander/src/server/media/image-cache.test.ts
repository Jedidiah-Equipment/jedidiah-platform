import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { type LoadedImage, readOptimizedImage } from './image-cache.js';
import { OPTIMIZED_CONTENT_TYPE } from './image-transform.js';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), 'lander-image-cache-test-'));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

async function rasterSource(width = 2000, height = 1500): Promise<Uint8Array> {
  return sharp({ create: { width, height, channels: 3, background: { r: 5, g: 90, b: 160 } } })
    .png()
    .toBuffer();
}

function loaderFor(bytes: Uint8Array, contentType = 'image/png'): () => Promise<LoadedImage> {
  return vi.fn(async () => ({ bytes, contentType }));
}

describe('readOptimizedImage', () => {
  test('optimizes and caches a source on a miss', async () => {
    const load = loaderFor(await rasterSource());

    const result = await readOptimizedImage({ cacheDir }, 'products/a/primary/x.png', load);

    expect(result.contentType).toBe(OPTIMIZED_CONTENT_TYPE);
    expect((await sharp(result.body).metadata()).format).toBe('webp');
    expect(load).toHaveBeenCalledTimes(1);
    expect((await readdir(cacheDir)).filter((name) => name.endsWith('.webp'))).toHaveLength(1);
  });

  test('serves a hit from disk without reloading the source', async () => {
    const key = 'products/a/primary/x.png';
    const first = loaderFor(await rasterSource());
    await readOptimizedImage({ cacheDir }, key, first);

    const second = loaderFor(await rasterSource());
    const result = await readOptimizedImage({ cacheDir }, key, second);

    expect(second).not.toHaveBeenCalled();
    expect(result.contentType).toBe(OPTIMIZED_CONTENT_TYPE);
  });

  test('coalesces concurrent misses for the same key into one optimization', async () => {
    const bytes = await rasterSource();
    const optimize = vi.fn(async (input: Uint8Array) => sharp(input).webp().toBuffer());
    const load = loaderFor(bytes);

    const [a, b] = await Promise.all([
      readOptimizedImage({ cacheDir, optimize }, 'products/a/primary/x.png', load),
      readOptimizedImage({ cacheDir, optimize }, 'products/a/primary/x.png', load),
    ]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(optimize).toHaveBeenCalledTimes(1);
    expect(a.body).toEqual(b.body);
  });

  test('falls back to the original bytes and does not cache when optimization fails', async () => {
    const original = new Uint8Array([1, 2, 3, 4]);
    const load = loaderFor(original, 'image/png');
    const optimize = vi.fn(async () => {
      throw new Error('unsupported source');
    });

    const result = await readOptimizedImage({ cacheDir, optimize }, 'products/a/primary/x.png', load);

    expect(result).toEqual({ body: original, byteSize: 4, contentType: 'image/png' });
    expect((await readdir(cacheDir)).filter((name) => name.endsWith('.webp'))).toHaveLength(0);
  });

  test('does not leave temp files behind after a successful write', async () => {
    await readOptimizedImage({ cacheDir }, 'products/a/primary/x.png', loaderFor(await rasterSource()));

    expect((await readdir(cacheDir)).filter((name) => name.endsWith('.tmp'))).toHaveLength(0);
  });

  test('a different storage key produces a different cache entry', async () => {
    const load = loaderFor(await rasterSource());

    await readOptimizedImage({ cacheDir }, 'products/a/primary/v1.png', load);
    await readOptimizedImage({ cacheDir }, 'products/a/primary/v2.png', load);

    expect((await readdir(cacheDir)).filter((name) => name.endsWith('.webp'))).toHaveLength(2);
  });

  test('serves a pre-existing cache file without invoking the loader', async () => {
    const key = 'products/a/primary/x.png';
    // Prime the cache by producing the file once, then confirm a fresh call reads it directly.
    await readOptimizedImage({ cacheDir }, key, loaderFor(await rasterSource()));
    const files = await readdir(cacheDir);
    expect(files).toHaveLength(1);

    const load = vi.fn(async (): Promise<LoadedImage> => {
      throw new Error('loader should not run on a hit');
    });
    await expect(readOptimizedImage({ cacheDir }, key, load)).resolves.toBeDefined();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('cache directory', () => {
  test('is created on demand when it does not yet exist', async () => {
    const nested = path.join(cacheDir, 'does', 'not', 'exist');
    await writeFile(path.join(cacheDir, 'sentinel'), 'x');

    const result = await readOptimizedImage(
      { cacheDir: nested },
      'products/a/primary/x.png',
      loaderFor(await rasterSource()),
    );

    expect(result.contentType).toBe(OPTIMIZED_CONTENT_TYPE);
    expect((await readdir(nested)).filter((name) => name.endsWith('.webp'))).toHaveLength(1);
  });
});
