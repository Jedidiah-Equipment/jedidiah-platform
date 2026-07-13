import { redirect } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader, getRequestUrl, setCookie, setResponseHeader } from '@tanstack/react-start/server';

import { CANONICAL_LOCALE, isLocale, type Locale, localePath } from './locale.js';

export const LOCALE_PREFERENCE_COOKIE = 'jedidiah_locale';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const PREFERENCE_VARY = 'Cookie, Accept-Language';

export function preferredLocaleFromAcceptLanguage(header: string | undefined): Locale {
  if (!header) {
    return CANONICAL_LOCALE;
  }

  const preferences = header
    .split(',')
    .map((entry, index) => {
      const [languageTag = '', ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const parsedQuality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;

      return {
        language: languageTag.toLowerCase().split('-')[0],
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
        index,
      };
    })
    .filter((preference) => preference.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const preference of preferences) {
    if (isLocale(preference.language)) {
      return preference.language;
    }
  }

  return CANONICAL_LOCALE;
}

export function resolveLocalePreference(
  storedValue: string | undefined,
  acceptLanguage: string | undefined,
): { locale: Locale; shouldPersist: boolean } {
  if (isLocale(storedValue)) {
    return { locale: storedValue, shouldPersist: false };
  }

  return { locale: preferredLocaleFromAcceptLanguage(acceptLanguage), shouldPersist: true };
}

export function localePreferenceCookie(locale: Locale, secure: boolean): string {
  return `${LOCALE_PREFERENCE_COOKIE}=${locale}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function persistServerLocalePreference(locale: Locale) {
  const requestUrl = getRequestUrl({ xForwardedHost: true });
  setCookie(LOCALE_PREFERENCE_COOKIE, locale, {
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: requestUrl.protocol === 'https:',
  });
}

export const persistLocalePreference: (locale: Locale) => void = createIsomorphicFn()
  .server((locale: Locale) => persistServerLocalePreference(locale))
  .client((locale: Locale) => {
    // The preference must be visible to SSR before the full-document locale navigation starts.
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store is not consistently available across supported browsers.
    document.cookie = localePreferenceCookie(locale, window.location.protocol === 'https:');
  });

export const honorLocalePreference: (routeLocale: Locale) => void = createIsomorphicFn()
  .server((routeLocale: Locale) => {
    if (routeLocale !== CANONICAL_LOCALE) {
      return;
    }

    const preference = resolveLocalePreference(
      getCookie(LOCALE_PREFERENCE_COOKIE),
      getRequestHeader('accept-language'),
    );
    setResponseHeader('vary', PREFERENCE_VARY);

    if (preference.shouldPersist) {
      persistServerLocalePreference(preference.locale);
    }
    if (preference.locale === CANONICAL_LOCALE) {
      return;
    }

    const requestUrl = getRequestUrl({ xForwardedHost: true });
    throw redirect({
      href: `${localePath(requestUrl.pathname, preference.locale)}${requestUrl.search}`,
      statusCode: 302,
      headers: { Vary: PREFERENCE_VARY },
    });
  })
  .client(() => undefined);
