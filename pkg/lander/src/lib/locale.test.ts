import { describe, expect, test } from 'vitest';

import { isLocale, localePath, resolveRouteLocale, switchLocaleHref, translationForLocale } from './locale.js';

describe('resolveRouteLocale', () => {
  test('uses English for the unprefixed tree and Afrikaans for the /af tree', () => {
    expect(resolveRouteLocale(undefined)).toBe('en');
    expect(resolveRouteLocale('af')).toBe('af');
  });

  test('rejects the canonical locale as a prefix and rejects unknown prefixes', () => {
    expect(resolveRouteLocale('en')).toBeNull();
    expect(resolveRouteLocale('fr')).toBeNull();
  });
});

test('isLocale recognises only configured locale codes', () => {
  expect(isLocale('en')).toBe(true);
  expect(isLocale('af')).toBe(true);
  expect(isLocale('fr')).toBe(false);
});

describe('localePath', () => {
  test('keeps canonical paths unprefixed and prefixes Afrikaans paths', () => {
    expect(localePath('/', 'en')).toBe('/');
    expect(localePath('/products/CH-450', 'en')).toBe('/products/CH-450');
    expect(localePath('/', 'af')).toBe('/af');
    expect(localePath('/products/CH-450', 'af')).toBe('/af/products/CH-450');
  });
});

describe('switchLocaleHref', () => {
  test('switches locale on the same page while preserving search params', () => {
    expect(switchLocaleHref('/products?range=trailers&variant=tipper', 'af')).toBe(
      '/af/products?range=trailers&variant=tipper',
    );
    expect(switchLocaleHref('/af/products?range=trailers&variant=tipper', 'en')).toBe(
      '/products?range=trailers&variant=tipper',
    );
  });

  test('switches both home URLs without introducing a trailing slash', () => {
    expect(switchLocaleHref('/', 'af')).toBe('/af');
    expect(switchLocaleHref('/af', 'en')).toBe('/');
  });
});

describe('translationForLocale', () => {
  const translations = {
    en: { name: 'Stored English' },
    af: { name: 'Afrikaans' },
  };

  test('ignores stored canonical translations', () => {
    expect(translationForLocale(translations, 'en')).toBeUndefined();
  });

  test('selects a stored non-canonical translation when available', () => {
    expect(translationForLocale(translations, 'af')).toEqual({ name: 'Afrikaans' });
    expect(translationForLocale(undefined, 'af')).toBeUndefined();
  });
});
