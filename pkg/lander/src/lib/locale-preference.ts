import { redirect } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest, getRequestUrl, setResponseHeader } from '@tanstack/react-start/server';

import { CANONICAL_LOCALE, isLocale, type Locale, switchLocaleHref } from './locale.js';

export const LOCALE_PREFERENCE_COOKIE = 'jedidiah_locale';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const PREFERENCE_VARY = 'Cookie, Accept-Language';
const ACCEPT_LANGUAGE_ENTRY =
  /^([a-z]{1,8}(?:-[a-z0-9]{1,8})*|\*)(?:\s*;\s*q=(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?))?$/i;

export type LocalePreferenceSource = 'auto' | 'explicit';
export type LocalePreference = { locale: Locale; source: LocalePreferenceSource };
export type LocalePreferenceDecision = { cookie: LocalePreference | null; redirectHref: string | null };

export function preferredLocaleFromAcceptLanguage(header: string | undefined): Locale {
  if (!header) {
    return CANONICAL_LOCALE;
  }

  const entries = header.split(',').map((entry) => entry.trim().match(ACCEPT_LANGUAGE_ENTRY));
  if (entries.some((entry) => entry === null)) {
    return CANONICAL_LOCALE;
  }

  // Product policy intentionally treats any valid Afrikaans tag as a signal, independent of q-value.
  const hasAfrikaans = entries.some((entry) => entry?.[1]?.toLowerCase().split('-')[0] === 'af');

  return hasAfrikaans ? 'af' : CANONICAL_LOCALE;
}

export function parseLocalePreference(value: string | undefined): LocalePreference | null {
  if (!value) {
    return null;
  }

  const [locale, source, extra] = value.split('.');
  if (extra !== undefined || !isLocale(locale) || (source !== 'auto' && source !== 'explicit')) {
    return null;
  }

  return { locale, source };
}

function serializeLocalePreference(preference: LocalePreference): string {
  return `${preference.locale}.${preference.source}`;
}

function requestCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return undefined;
  }

  for (const entry of cookieHeader.split(';')) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    if (entry.slice(0, separatorIndex).trim() === name) {
      return entry.slice(separatorIndex + 1).trim();
    }
  }

  return undefined;
}

export function resolveLocalePreferenceRequest(request: Request, routeLocale: Locale): LocalePreferenceDecision {
  const storedPreference = parseLocalePreference(requestCookie(request, LOCALE_PREFERENCE_COOKIE));
  const requestUrl = new URL(request.url);
  const currentHref = `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;

  if (storedPreference) {
    return {
      cookie: null,
      redirectHref:
        storedPreference.locale === routeLocale ? null : switchLocaleHref(currentHref, storedPreference.locale),
    };
  }

  // A first visit to a prefixed URL is itself the locale signal. Never redirect it away based on headers,
  // or cookieless crawlers could not crawl the translated URL tree.
  const locale =
    routeLocale === CANONICAL_LOCALE
      ? preferredLocaleFromAcceptLanguage(request.headers.get('accept-language') ?? undefined)
      : routeLocale;
  const preference: LocalePreference = { locale, source: 'auto' };

  return {
    cookie: preference,
    redirectHref: locale === routeLocale ? null : switchLocaleHref(currentHref, locale),
  };
}

export function localePreferenceCookie(preference: LocalePreference, secure: boolean): string {
  return `${LOCALE_PREFERENCE_COOKIE}=${serializeLocalePreference(preference)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function localePreferenceHref(currentHref: string, target: Locale): string {
  const returnTo = switchLocaleHref(currentHref, target);
  return `/locale/${target}?returnTo=${encodeURIComponent(returnTo)}`;
}

function persistServerLocalePreference(preference: LocalePreference) {
  const requestUrl = getRequestUrl({ xForwardedHost: true });
  setResponseHeader('set-cookie', localePreferenceCookie(preference, requestUrl.protocol === 'https:'));
}

export const honorLocalePreference: (routeLocale: Locale) => void = createIsomorphicFn()
  .server((routeLocale: Locale) => {
    const decision = resolveLocalePreferenceRequest(getRequest(), routeLocale);
    setResponseHeader('vary', PREFERENCE_VARY);

    if (decision.cookie) {
      persistServerLocalePreference(decision.cookie);
    }
    if (!decision.redirectHref) {
      return;
    }

    throw redirect({
      href: decision.redirectHref,
      statusCode: 302,
      headers: { Vary: PREFERENCE_VARY },
    });
  })
  .client(() => undefined);
