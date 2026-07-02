import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import { optimizeImage } from './image-optimizer.js';
import { OPTIMIZED_MAX_WIDTH } from './image-transform.js';

// Build a solid-colour raster of the given size, so tests exercise real sharp encoding without a fixture.
function source(width: number, height: number, format: 'png' | 'jpeg'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    [format]()
    .toBuffer();
}

describe('optimizeImage', () => {
  test('downscales an oversized source to the target width and re-encodes as WebP', async () => {
    const output = await optimizeImage(await source(4000, 3000, 'jpeg'), 'webp');
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(OPTIMIZED_MAX_WIDTH);
    expect(meta.height).toBe(Math.round((OPTIMIZED_MAX_WIDTH * 3000) / 4000));
  });

  test('re-encodes a small source to WebP without enlarging it', async () => {
    const output = await optimizeImage(await source(640, 480, 'png'), 'webp');
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
  });

  test('re-encodes to JPEG when asked for the og:image format', async () => {
    const output = await optimizeImage(await source(4000, 3000, 'png'), 'jpeg');
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(OPTIMIZED_MAX_WIDTH);
  });

  test("flattens a transparent PNG onto white for JPEG, not sharp's default black", async () => {
    const transparent = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const output = await optimizeImage(transparent, 'jpeg');
    const { data } = await sharp(output).raw().toBuffer({ resolveWithObject: true });

    // JPEG is lossy, so allow a little wiggle around pure white.
    expect(data[0]).toBeGreaterThan(250);
    expect(data[1]).toBeGreaterThan(250);
    expect(data[2]).toBeGreaterThan(250);
  });

  test('throws on non-raster input', async () => {
    await expect(optimizeImage(new TextEncoder().encode('not an image'), 'webp')).rejects.toThrow();
  });
});
