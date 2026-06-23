import { describe, expect, test } from 'vitest';

import { absoluteUrl, DEFAULT_OG_IMAGE, SITE_URL, seoHead, truncateDescription } from './seo.js';

describe('absoluteUrl', () => {
  test('joins a site-relative path onto the origin', () => {
    expect(absoluteUrl('/products')).toBe(`${SITE_URL}/products`);
  });

  test('adds a leading slash when missing', () => {
    expect(absoluteUrl('about')).toBe(`${SITE_URL}/about`);
  });

  test('passes an already-absolute URL through unchanged', () => {
    expect(absoluteUrl('https://cdn.example.com/og.png')).toBe('https://cdn.example.com/og.png');
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
  test('builds title, description, canonical and absolute OG/Twitter tags', () => {
    const { meta, links } = seoHead({
      title: 'Products — Jedidiah Equipment',
      description: 'The full range.',
      path: '/products',
    });

    expect(meta).toContainEqual({ title: 'Products — Jedidiah Equipment' });
    expect(meta).toContainEqual({ name: 'description', content: 'The full range.' });
    expect(meta).toContainEqual({ property: 'og:url', content: `${SITE_URL}/products` });
    expect(meta).toContainEqual({ property: 'og:image', content: `${SITE_URL}${DEFAULT_OG_IMAGE}` });
    expect(meta).toContainEqual({ name: 'twitter:title', content: 'Products — Jedidiah Equipment' });
    expect(links).toContainEqual({ rel: 'canonical', href: `${SITE_URL}/products` });
  });

  test('uses a page-specific image when given, made absolute', () => {
    const { meta } = seoHead({
      title: 'CH14',
      description: 'Tipper.',
      path: '/products/CH14',
      image: '/images/products/abc',
    });

    expect(meta).toContainEqual({ property: 'og:image', content: `${SITE_URL}/images/products/abc` });
    expect(meta).toContainEqual({ name: 'twitter:image', content: `${SITE_URL}/images/products/abc` });
  });
});
