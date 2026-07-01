import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import { OPTIMIZED_MAX_WIDTH, optimizeImage } from './image-optimizer.js';

// Build a solid-colour raster of the given size, so tests exercise real sharp encoding without a fixture.
function source(width: number, height: number, format: 'png' | 'jpeg'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    [format]()
    .toBuffer();
}

describe('optimizeImage', () => {
  test('downscales an oversized source to the target width and re-encodes as WebP', async () => {
    const output = await optimizeImage(await source(4000, 3000, 'jpeg'));
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(OPTIMIZED_MAX_WIDTH);
    expect(meta.height).toBe(Math.round((OPTIMIZED_MAX_WIDTH * 3000) / 4000));
  });

  test('re-encodes a small source to WebP without enlarging it', async () => {
    const output = await optimizeImage(await source(640, 480, 'png'));
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
  });

  test('throws on non-raster input', async () => {
    await expect(optimizeImage(new TextEncoder().encode('not an image'))).rejects.toThrow();
  });
});
