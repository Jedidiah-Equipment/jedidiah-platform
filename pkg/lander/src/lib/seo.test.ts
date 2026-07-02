import { describe, expect, test } from 'vitest';

import { DEFAULT_OG_IMAGE, seoHead, truncateDescription } from './seo.js';

describe('truncateDescription', () => {
  test('returns short text unchanged (whitespace collapsed)', () => {
    expect(truncateDescription('A  tidy   description')).toBe('A tidy description');
  });

  test('truncates on a word boundary with an ellipsis', () => {
    const result = truncateDescription('one two three four five', 12);

    expect(result).toBe('one two…');
    expect(result.length).toBeLessThanOrEqual(12);
  });
});

describe('seoHead', () => {
  test('builds title, description and root-relative OG/Twitter tags with no canonical link', () => {
    const result = seoHead({
      title: 'Products — Jedidiah Equipment',
      description: 'The full range.',
      path: '/products',
    });

    expect(result.meta).toContainEqual({ title: 'Products — Jedidiah Equipment' });
    expect(result.meta).toContainEqual({ name: 'description', content: 'The full range.' });
    expect(result.meta).toContainEqual({ property: 'og:url', content: '/products' });
    expect(result.meta).toContainEqual({ property: 'og:image', content: DEFAULT_OG_IMAGE });
    expect(result.meta).toContainEqual({ name: 'twitter:title', content: 'Products — Jedidiah Equipment' });
    expect(result).not.toHaveProperty('links');
  });

  test('uses a page-specific image when given, kept root-relative', () => {
    const { meta } = seoHead({
      title: 'CH14',
      description: 'Tipper.',
      path: '/products/CH14',
      image: '/images/products/abc',
    });

    expect(meta).toContainEqual({ property: 'og:image', content: '/images/products/abc' });
    expect(meta).toContainEqual({ name: 'twitter:image', content: '/images/products/abc' });
  });
});
