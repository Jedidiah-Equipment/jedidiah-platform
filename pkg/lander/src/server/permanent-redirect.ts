const APEX_HOSTNAME = 'jedidiahequipment.co.za';
const WWW_HOSTNAME = `www.${APEX_HOSTNAME}`;

// These paths were published by the previous WordPress site, so they must remain permanent entry points.
const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/about-us/': '/about',
  '/contact-us/': '/contact',
  '/cross-haul-trailer-range/': '/products',
  '/elementor-265/': '/products',
  '/hd2020-in-line-ripper-range/': '/products',
  '/st300-strip-till-range/': '/products',
};

export function permanentRedirectLocation(requestUrl: string | URL): string | null {
  const url = new URL(requestUrl);
  const legacyRedirectPath = LEGACY_REDIRECTS[url.pathname];

  if (url.hostname === WWW_HOSTNAME) {
    // Resolve legacy paths in the same response so old www links never incur a second redirect.
    url.hostname = APEX_HOSTNAME;
    if (legacyRedirectPath) {
      url.pathname = legacyRedirectPath;
    }
    return url.toString();
  }

  return legacyRedirectPath ?? null;
}
