import { describe, expect, test } from 'vitest';

import {
  localePreferenceCookie,
  preferredLocaleFromAcceptLanguage,
  resolveLocalePreference,
} from './locale-preference.js';

describe('preferredLocaleFromAcceptLanguage', () => {
  test('selects the highest-priority supported language and understands regional tags', () => {
    expect(preferredLocaleFromAcceptLanguage('af-ZA,af;q=0.9,en;q=0.8')).toBe('af');
    expect(preferredLocaleFromAcceptLanguage('fr-FR,en-ZA;q=0.9,af;q=0.8')).toBe('en');
  });

  test('ignores languages excluded with q=0 and defaults to canonical English', () => {
    expect(preferredLocaleFromAcceptLanguage('af;q=0,en;q=0.7')).toBe('en');
    expect(preferredLocaleFromAcceptLanguage('fr-FR')).toBe('en');
    expect(preferredLocaleFromAcceptLanguage(undefined)).toBe('en');
  });
});

describe('resolveLocalePreference', () => {
  test('lets a stored explicit preference win over browser language detection', () => {
    expect(resolveLocalePreference('af', 'en-ZA')).toEqual({ locale: 'af', shouldPersist: false });
  });

  test('detects and persists a preference when the cookie is absent or invalid', () => {
    expect(resolveLocalePreference(undefined, 'af-ZA')).toEqual({ locale: 'af', shouldPersist: true });
    expect(resolveLocalePreference('unknown', 'en-ZA')).toEqual({ locale: 'en', shouldPersist: true });
  });
});

test('localePreferenceCookie is available site-wide and secure on HTTPS', () => {
  expect(localePreferenceCookie('af', false)).toBe('jedidiah_locale=af; Path=/; Max-Age=31536000; SameSite=Lax');
  expect(localePreferenceCookie('en', true)).toBe('jedidiah_locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
});
