import { IMAGE_TRANSFORMS, SOCIAL_CARD_SIZE } from '@pkg/core';
import { describe, expect, test, vi } from 'vitest';

import { OG_CARD } from '../assets/images.js';
import { absoluteUrl, DEFAULT_OG_IMAGE, OG_IMAGE_META, seoHead, truncateDescription } from './seo.js';

// The isomorphic request-origin lookup needs a live request (server) or window (client); tests pin it to a
// fixed origin so seoHead's output is deterministic.
vi.mock('./site-origin.js', () => ({ siteOrigin: () => 'https://staging.example.test' }));

const ORIGIN = 'https://staging.example.test';

describe('absoluteUrl', () => {
  test('qualifies a root-relative path against the serving origin', () => {
    expect(absoluteUrl('/products')).toBe(`${ORIGIN}/products`);
  });
});

describe('DEFAULT_OG_IMAGE', () => {
  // Asserted against the resolved asset rather than against itself: a social card that 404s still produces
  // a perfectly well-formed og:image tag, so comparing the constant to the constant proves nothing. Pointing
  // this at a file the build does not emit is what silently kills every preview card.
  //
  // The path is matched loosely because Vite serves an unhashed `/src/...` URL in dev and a hashed
  // `/assets/...` one from a build. What both forms share — and what a hand-written public path lacks — is
  // the generated basename.
  test('resolves to a generated asset, not a bare path that nothing serves', () => {
    expect(DEFAULT_OG_IMAGE).toMatch(/\/og-card-\d+[\w.-]*\.jpeg$/);
  });

  // Scrapers refuse WebP — the same reason @pkg/core keeps a `jpeg` catalog transform for product cards.
  test('is a JPEG', () => {
    expect(DEFAULT_OG_IMAGE.endsWith('.jpeg')).toBe(true);
  });
});

describe('OG_IMAGE_META', () => {
  test('declares the type and both dimensions', () => {
    expect(OG_IMAGE_META).toEqual([
      { property: 'og:image:type', content: 'image/jpeg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
    ]);
  });

  // One set of dimension tags covers two different producers: the asset script's static card, and the
  // `jpeg` transform that renders a Product's own. Nothing in either path forces them to agree, so this is
  // what keeps the tags honest — regenerating the card at another size fails here rather than shipping meta
  // that lies about the bytes.
  test('matches the box the @pkg/core card transform crops to', () => {
    expect({ width: OG_CARD.width, height: OG_CARD.height }).toEqual({
      width: SOCIAL_CARD_SIZE.width,
      height: SOCIAL_CARD_SIZE.height,
    });
    expect(IMAGE_TRANSFORMS.jpeg.maxWidth).toBe(OG_CARD.width);
    expect(IMAGE_TRANSFORMS.jpeg.exactHeight).toBe(OG_CARD.height);
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
      locale: 'en',
    });

    expect(meta).toContainEqual({ title: 'Products — Jedidiah Equipment' });
    expect(meta).toContainEqual({ name: 'description', content: 'The full range.' });
    expect(meta).toContainEqual({ property: 'og:url', content: `${ORIGIN}/products` });
    expect(meta).toContainEqual({ property: 'og:image', content: `${ORIGIN}${DEFAULT_OG_IMAGE}` });
    expect(meta).toContainEqual({ property: 'og:image:width', content: '1200' });
    expect(meta).toContainEqual({ property: 'og:image:height', content: '630' });
    expect(meta).toContainEqual({ name: 'twitter:title', content: 'Products — Jedidiah Equipment' });
    expect(meta).toContainEqual({ property: 'og:locale', content: 'en_ZA' });
    expect(links).toContainEqual({ rel: 'canonical', href: `${ORIGIN}/products` });
    expect(links).toContainEqual({ rel: 'alternate', hrefLang: 'en', href: `${ORIGIN}/products` });
    expect(links).toContainEqual({ rel: 'alternate', hrefLang: 'af', href: `${ORIGIN}/af/products` });
    expect(links).toContainEqual({ rel: 'alternate', hrefLang: 'x-default', href: `${ORIGIN}/products` });
  });

  test('makes an Afrikaans page self-canonical while alternating to the same English path', () => {
    const { meta, links } = seoHead({
      title: 'Produkte — Jedidiah Equipment',
      description: 'Die volledige reeks.',
      path: '/products',
      locale: 'af',
    });

    expect(meta).toContainEqual({ property: 'og:url', content: `${ORIGIN}/af/products` });
    expect(meta).toContainEqual({ property: 'og:locale', content: 'af_ZA' });
    expect(links).toContainEqual({ rel: 'canonical', href: `${ORIGIN}/af/products` });
    expect(links).toContainEqual({ rel: 'alternate', hrefLang: 'en', href: `${ORIGIN}/products` });
    expect(links).toContainEqual({ rel: 'alternate', hrefLang: 'af', href: `${ORIGIN}/af/products` });
  });

  test('uses a page-specific image when given, qualified against the serving origin', () => {
    const { meta } = seoHead({
      title: 'CH14',
      description: 'Tipper.',
      path: '/products/CH14',
      locale: 'en',
      image: '/images/products/abc',
    });

    expect(meta).toContainEqual({ property: 'og:image', content: `${ORIGIN}/images/products/abc` });
    expect(meta).toContainEqual({ name: 'twitter:image', content: `${ORIGIN}/images/products/abc` });
  });
});
