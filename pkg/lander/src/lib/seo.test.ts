import { describe, expect, test, vi } from 'vitest';

import { absoluteUrl, DEFAULT_OG_IMAGE, seoHead, truncateDescription } from './seo.js';

// The isomorphic request-origin lookup needs a live request (server) or window (client); tests pin it to a
// fixed origin so seoHead's output is deterministic.
vi.mock('./site-origin.js', () => ({ siteOrigin: () => 'https://staging.example.test' }));

const ORIGIN = 'https://staging.example.test';

describe('absoluteUrl', () => {
  test('qualifies a root-relative path against the serving origin', () => {
    expect(absoluteUrl('/products')).toBe(`${ORIGIN}/products`);
  });
});

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
  test('builds title, description, canonical and absolute OG/Twitter tags from the serving origin', () => {
    const { meta, links } = seoHead({
      title: 'Products — Jedidiah Equipment',
      description: 'The full range.',
      path: '/products',
    });

    expect(meta).toContainEqual({ title: 'Products — Jedidiah Equipment' });
    expect(meta).toContainEqual({ name: 'description', content: 'The full range.' });
    expect(meta).toContainEqual({ property: 'og:url', content: `${ORIGIN}/products` });
    expect(meta).toContainEqual({ property: 'og:image', content: `${ORIGIN}${DEFAULT_OG_IMAGE}` });
    expect(meta).toContainEqual({ name: 'twitter:title', content: 'Products — Jedidiah Equipment' });
    expect(links).toContainEqual({ rel: 'canonical', href: `${ORIGIN}/products` });
  });

  test('uses a page-specific image when given, qualified against the serving origin', () => {
    const { meta } = seoHead({
      title: 'CH14',
      description: 'Tipper.',
      path: '/products/CH14',
      image: '/images/products/abc',
    });

    expect(meta).toContainEqual({ property: 'og:image', content: `${ORIGIN}/images/products/abc` });
    expect(meta).toContainEqual({ name: 'twitter:image', content: `${ORIGIN}/images/products/abc` });
  });
});
