import { CATALOG_IMAGE_WIDTHS } from '@pkg/core';
import { describe, expect, test } from 'vitest';

import { parseImageFormat, parseImageWidth, resolveImageTransform } from './image-format.js';

describe('parseImageWidth', () => {
  test('honours every published candidate width', () => {
    for (const width of CATALOG_IMAGE_WIDTHS) {
      expect(parseImageWidth(String(width))).toBe(width);
    }
  });

  test('falls back to the widest candidate for anything unpublished', () => {
    // An arbitrary width would let any caller mint unbounded cache entries and sharp work, so unlisted
    // values are not honoured — they are answered with the default rather than rejected, because these URLs
    // are public and a crawler with a stale link should still get an image.
    for (const value of ['500', '4000', '0', '-640', '640.5', 'wide', '', null, undefined]) {
      expect(parseImageWidth(value), String(value)).toBe(1280);
    }
  });
});

describe('resolveImageTransform', () => {
  test('maps a width to its WebP transform', () => {
    expect(resolveImageTransform(null, '320')).toBe('webp320');
    expect(resolveImageTransform('webp', '960')).toBe('webp960');
  });

  test('keeps a URL that names no width on the pre-existing transform', () => {
    expect(resolveImageTransform(null, null)).toBe('webp1280');
  });

  test('ignores width for the social-card JPEG, which is only made at one size', () => {
    expect(resolveImageTransform('jpeg', '320')).toBe('jpeg');
    expect(resolveImageTransform('jpeg', null)).toBe('jpeg');
  });
});

describe('parseImageFormat', () => {
  test('treats anything but an explicit jpeg as webp', () => {
    expect(parseImageFormat('jpeg')).toBe('jpeg');
    expect(parseImageFormat('webp')).toBe('webp');
    expect(parseImageFormat('png')).toBe('webp');
    expect(parseImageFormat(null)).toBe('webp');
  });
});
