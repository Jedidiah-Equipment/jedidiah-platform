import { isLocale, localePath, switchLocaleHref } from '../../lib/locale.js';
import { localePreferenceCookie } from '../../lib/locale-preference.js';

function safeReturnTo(requestUrl: URL): string {
  const returnTo = requestUrl.searchParams.get('returnTo');
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//')) {
    return '/';
  }

  const resolved = new URL(returnTo, requestUrl.origin);
  if (resolved.origin !== requestUrl.origin) {
    return '/';
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function handleExplicitLocalePreference(request: Request, requestedLocale: string): Response {
  if (!isLocale(requestedLocale)) {
    return new Response(null, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl);
  const location = returnTo === '/' ? localePath('/', requestedLocale) : switchLocaleHref(returnTo, requestedLocale);

  return new Response(null, {
    status: 302,
    headers: {
      location,
      'set-cookie': localePreferenceCookie(
        { locale: requestedLocale, source: 'explicit' },
        requestUrl.protocol === 'https:',
      ),
    },
  });
}
