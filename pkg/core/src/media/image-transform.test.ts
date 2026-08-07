import { describe, expect, test } from 'vitest';

import {
  CATALOG_IMAGE_WIDTHS,
  DEFAULT_CATALOG_IMAGE_WIDTH,
  IMAGE_TRANSFORMS,
  transformSignature,
  webpTransformForWidth,
} from './image-transform.js';

describe('image transforms', () => {
  // Both of these signatures predate the width-named transforms and are embedded in live cache keys: the
  // rename must not move a single byte of already-cached output.
  test('keeps the established Lander signatures unchanged', () => {
    expect(transformSignature('webp1280')).toBe('w1280-webp-q80');
    expect(transformSignature('jpeg')).toBe('w1024-jpeg-q75');
  });

  test('keeps the mobile WebP transform at w640 and q80', () => {
    expect(IMAGE_TRANSFORMS.webp640).toEqual({
      maxWidth: 640,
      quality: 80,
      contentType: 'image/webp',
    });
    expect(transformSignature('webp640')).toBe('w640-webp-q80');
  });

  test('names a transform for every catalog width', () => {
    for (const width of CATALOG_IMAGE_WIDTHS) {
      expect(IMAGE_TRANSFORMS[webpTransformForWidth(width)].maxWidth).toBe(width);
      expect(transformSignature(webpTransformForWidth(width))).toBe(`w${width}-webp-q80`);
    }
  });

  test('defaults to the widest candidate, so a URL naming no width is unchanged', () => {
    expect(DEFAULT_CATALOG_IMAGE_WIDTH).toBe(Math.max(...CATALOG_IMAGE_WIDTHS));
    expect(transformSignature(webpTransformForWidth(DEFAULT_CATALOG_IMAGE_WIDTH))).toBe('w1280-webp-q80');
  });
});
