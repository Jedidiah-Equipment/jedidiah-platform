export const LOCALES = ['en', 'af'] as const;
export type Locale = (typeof LOCALES)[number];
export const CANONICAL_LOCALE: Locale = 'en';

type LocaleMetadata = { pathPrefix: string; openGraphLocale: string };

export const LOCALE_METADATA: Record<Locale, LocaleMetadata> = {
  en: { pathPrefix: '', openGraphLocale: 'en_ZA' },
  af: { pathPrefix: '/af', openGraphLocale: 'af_ZA' },
};

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function resolveRouteLocale(param: string | undefined): Locale | null {
  if (param === undefined) {
    return CANONICAL_LOCALE;
  }

  return isLocale(param) && param !== CANONICAL_LOCALE ? param : null;
}

export function localePath(canonicalPath: string, locale: Locale): string {
  const prefix = LOCALE_METADATA[locale].pathPrefix;

  return canonicalPath === '/' ? prefix || '/' : `${prefix}${canonicalPath}`;
}

export function switchLocaleHref(currentHref: string, target: Locale): string {
  const queryIndex = currentHref.search(/[?#]/);
  const pathname = queryIndex === -1 ? currentHref : currentHref.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? '' : currentHref.slice(queryIndex);
  const localizedPrefix = LOCALES.map((locale) => LOCALE_METADATA[locale].pathPrefix).find(
    (prefix) => prefix !== '' && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
  const canonicalPath = localizedPrefix ? pathname.slice(localizedPrefix.length) || '/' : pathname;

  return `${localePath(canonicalPath || '/', target)}${suffix}`;
}
