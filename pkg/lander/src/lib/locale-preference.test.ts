import { describe, expect, test } from 'vitest';

import type { Locale } from './locale.js';
import {
  localePreferenceCookie,
  localePreferenceHref,
  parseLocalePreference,
  preferredLocaleFromAcceptLanguage,
  resolveLocalePreferenceRequest,
} from './locale-preference.js';

function localeRequest(path: string, acceptLanguage?: string, cookie?: string): Request {
  const headers = new Headers();
  if (acceptLanguage) {
    headers.set('accept-language', acceptLanguage);
  }
  if (cookie) {
    headers.set('cookie', cookie);
  }

  return new Request(`https://lander.example.test${path}`, { headers });
}

describe('preferredLocaleFromAcceptLanguage', () => {
  test('any Afrikaans language tag wins regardless of quality or order', () => {
    expect(preferredLocaleFromAcceptLanguage('en-ZA,af;q=0.1')).toBe('af');
    expect(preferredLocaleFromAcceptLanguage('en;q=1,af-ZA;q=0')).toBe('af');
  });

  test('defaults to canonical English when Afrikaans is absent or the header is missing', () => {
    expect(preferredLocaleFromAcceptLanguage('fr-FR,en-ZA;q=0.9')).toBe('en');
    expect(preferredLocaleFromAcceptLanguage('not a language header')).toBe('en');
    expect(preferredLocaleFromAcceptLanguage(undefined)).toBe('en');
  });

  test.each(['af;q=garbage', 'af;q=99', 'af;bogus'])('treats malformed header %s as canonical English', (header) => {
    expect(preferredLocaleFromAcceptLanguage(header)).toBe('en');
  });
});

describe('locale preference cookie', () => {
  test('parses only supported locale and source combinations', () => {
    expect(parseLocalePreference('af.explicit')).toEqual({ locale: 'af', source: 'explicit' });
    expect(parseLocalePreference('en.auto')).toEqual({ locale: 'en', source: 'auto' });
    expect(parseLocalePreference('af')).toBeNull();
    expect(parseLocalePreference('fr.explicit')).toBeNull();
  });

  test('is available site-wide and secure on HTTPS', () => {
    expect(localePreferenceCookie({ locale: 'af', source: 'auto' }, false)).toBe(
      'jedidiah_locale=af.auto; Path=/; Max-Age=31536000; SameSite=Lax',
    );
    expect(localePreferenceCookie({ locale: 'en', source: 'explicit' }, true)).toBe(
      'jedidiah_locale=en.explicit; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    );
  });
});

describe('resolveLocalePreferenceRequest', () => {
  test.each<{
    entry: string;
    acceptLanguage?: string;
    routeLocale: Locale;
    expectedCookie: string;
    expectedRedirect: string | null;
  }>([
    {
      entry: '/products',
      acceptLanguage: 'af-ZA',
      routeLocale: 'en',
      expectedCookie: 'af.auto',
      expectedRedirect: '/af/products',
    },
    {
      entry: '/products',
      acceptLanguage: 'en-ZA',
      routeLocale: 'en',
      expectedCookie: 'en.auto',
      expectedRedirect: null,
    },
    {
      entry: '/products',
      routeLocale: 'en',
      expectedCookie: 'en.auto',
      expectedRedirect: null,
    },
    {
      entry: '/af/products',
      acceptLanguage: 'af-ZA',
      routeLocale: 'af',
      expectedCookie: 'af.auto',
      expectedRedirect: null,
    },
    {
      entry: '/af/products',
      acceptLanguage: 'en-ZA',
      routeLocale: 'af',
      expectedCookie: 'af.auto',
      expectedRedirect: null,
    },
    {
      entry: '/af/products',
      routeLocale: 'af',
      expectedCookie: 'af.auto',
      expectedRedirect: null,
    },
  ])('resolves first visit $entry with Accept-Language $acceptLanguage', ({
    entry,
    acceptLanguage,
    routeLocale,
    expectedCookie,
    expectedRedirect,
  }) => {
    expect(resolveLocalePreferenceRequest(localeRequest(entry, acceptLanguage), routeLocale)).toEqual({
      cookie: parseLocalePreference(expectedCookie),
      redirectHref: expectedRedirect,
    });
  });

  test('lets an explicit preference win over the entered URL and preserves the query string', () => {
    const request = localeRequest('/products/CH-450?x=1', undefined, 'other=value; jedidiah_locale=af.explicit');

    expect(resolveLocalePreferenceRequest(request, 'en')).toEqual({
      cookie: null,
      redirectHref: '/af/products/CH-450?x=1',
    });
  });

  test('continues honoring an auto preference until an explicit choice replaces it', () => {
    const request = localeRequest('/af/about', undefined, 'jedidiah_locale=en.auto');

    expect(resolveLocalePreferenceRequest(request, 'af')).toEqual({
      cookie: null,
      redirectHref: '/about',
    });
  });
});

test('localePreferenceHref targets the server endpoint and preserves path, query, and hash', () => {
  expect(localePreferenceHref('/products?range=trailers#models', 'af')).toBe(
    '/locale/af?returnTo=%2Faf%2Fproducts%3Frange%3Dtrailers%23models',
  );
});
