import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

// These paths were published by the previous WordPress site, so they must remain permanent entry points.
const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/about-us/': '/about',
  '/contact-us/': '/contact',
  '/cross-haul-trailer-range/': '/products',
  '/elementor-265/': '/products',
  '/hd2020-in-line-ripper-range/': '/products',
  '/st300-strip-till-range/': '/products',
};

export default createServerEntry({
  fetch(request) {
    const redirectLocation = LEGACY_REDIRECTS[new URL(request.url).pathname];
    if (redirectLocation) {
      return new Response(null, { status: 301, headers: { location: redirectLocation } });
    }

    return handler.fetch(request);
  },
});
