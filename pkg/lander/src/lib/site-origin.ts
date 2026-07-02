import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestUrl } from '@tanstack/react-start/server';

// Origin of the host actually serving this response, so head tags built from it are correct on every
// deployment (staging advertises staging URLs, production advertises production URLs) without a configured
// domain. Social scrapers require fully-qualified og:image/twitter:image URLs, so this must be an origin —
// not a relative path. On the server it derives from the incoming request (honouring x-forwarded-* from the
// Railway proxy); on the client it is the browser's own origin, which matches what the server rendered.
// The start compiler strips the server branch (and its server-only import) from the client bundle.
export const siteOrigin: () => string = createIsomorphicFn()
  .server(() => getRequestUrl({ xForwardedHost: true }).origin)
  .client(() => window.location.origin);
