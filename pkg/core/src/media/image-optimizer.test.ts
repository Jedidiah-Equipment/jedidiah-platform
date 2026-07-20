import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import { optimizeImage } from './image-optimizer.js';
import { IMAGE_TRANSFORMS } from './image-transform.js';

// Solid-colour rasters exercise the real encoder without binary fixtures.
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
    expect(meta.width).toBe(IMAGE_TRANSFORMS.webp.maxWidth);
    expect(meta.height).toBe(Math.round((IMAGE_TRANSFORMS.webp.maxWidth * 3000) / 4000));
  });

  test('re-encodes a small source to WebP without enlarging it', async () => {
    const output = await optimizeImage(await source(640, 480, 'png'), 'webp');
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
  });

  test('produces the mobile WebP variant at its smaller target width', async () => {
    const output = await optimizeImage(await source(1600, 1200, 'jpeg'), 'mobileWebp');
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(IMAGE_TRANSFORMS.mobileWebp.maxWidth);
    expect(meta.height).toBe(480);
  });

  test('re-encodes to JPEG at its own smaller width for social previews', async () => {
    const output = await optimizeImage(await source(4000, 3000, 'png'), 'jpeg');
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(IMAGE_TRANSFORMS.jpeg.maxWidth);
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
