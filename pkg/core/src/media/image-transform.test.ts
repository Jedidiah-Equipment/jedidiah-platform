import { describe, expect, test } from 'vitest';

import {
  CATALOG_IMAGE_WIDTHS,
  DEFAULT_CATALOG_IMAGE_WIDTH,
  IMAGE_TRANSFORMS,
  SOCIAL_CARD_SIZE,
  transformSignature,
  webpTransformForWidth,
} from './image-transform.js';

describe('image transforms', () => {
  // This signature predates the width-named transforms and is embedded in live cache keys: the rename must
  // not move a single byte of already-cached output.
  test('keeps the established Lander WebP signature unchanged', () => {
    expect(transformSignature('webp1280')).toBe('w1280-webp-q80');
  });

  // The card, by contrast, now produces genuinely different bytes than the old uncropped 1024px output, so
  // it must not reuse that key. Naming both axes is what distinguishes it; the stale entries go unread.
  test('gives the cropped card a signature naming both axes, not the old w1024 key', () => {
    expect(transformSignature('jpeg')).toBe('w1200x630-jpeg-q75');
  });

  test('crops the card to the size the platforms document', () => {
    expect(IMAGE_TRANSFORMS.jpeg.maxWidth).toBe(SOCIAL_CARD_SIZE.width);
    expect(IMAGE_TRANSFORMS.jpeg.exactHeight).toBe(SOCIAL_CARD_SIZE.height);
  });

  // Only the card is cropped. A catalog image is shown in the page's own layout, where trimming the
  // photograph to a fixed ratio would cut the machine in half.
  test('leaves every catalog transform uncropped', () => {
    for (const width of CATALOG_IMAGE_WIDTHS) {
      expect(IMAGE_TRANSFORMS[webpTransformForWidth(width)].exactHeight).toBeUndefined();
    }
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
