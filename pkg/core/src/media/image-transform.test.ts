import { describe, expect, test } from 'vitest';

import { IMAGE_TRANSFORMS, transformSignature } from './image-transform.js';

describe('image transforms', () => {
  test('keeps the established Lander signatures unchanged', () => {
    expect(transformSignature('webp')).toBe('w1280-webp-q80');
    expect(transformSignature('jpeg')).toBe('w1024-jpeg-q75');
  });

  test('defines the mobile WebP transform at w640 and q80', () => {
    expect(IMAGE_TRANSFORMS.mobileWebp).toEqual({
      maxWidth: 640,
      quality: 80,
      contentType: 'image/webp',
    });
    expect(transformSignature('mobileWebp')).toBe('w640-webp-q80');
  });
});
