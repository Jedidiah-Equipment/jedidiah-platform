import faviconUrl from '@pkg/domain/assets/brand/jedidiah-favicon-yellow.png';
import { createRootRoute, HeadContent, Outlet, Scripts, useMatch } from '@tanstack/react-router';
import { useEffect } from 'react';

import { initAnalytics } from '../lib/analytics.js';
import { CANONICAL_LOCALE } from '../lib/locale.js';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../lib/seo.js';
import { getSiteMeta } from '../server/site/site-meta.js';
import appCss from '../styles/app.css?url';

export const Route = createRootRoute({
  loader: async () => {
    return getSiteMeta();
  },
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // Keep non-production environments (staging, development) out of search results. The robots.txt route
      // already disallows crawling there; this adds a defence-in-depth noindex for any page fetched directly.
      ...(loaderData?.indexable === false ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
      // Site-wide social-card defaults. Localized page heads add their own title, description, locale and URL.
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
    ],
    links: [
      { rel: 'icon', type: 'image/png', href: faviconUrl },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600;700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootDocument,
});

// Initialises PostHog on mount. Pageviews — including SPA route changes — are captured by posthog-js itself
// via `capture_pageview: 'history_change'` (set by the `defaults` snapshot), so no manual wiring is needed.
// No-ops entirely when PostHog is unset.
function AnalyticsTracker() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}

function RootDocument() {
  // The locale layout's beforeLoad supplies context.locale; it is absent when the layout rejected the URL
  // (unknown prefix -> notFound), so the error document falls back to the canonical language.
  const localeMatch = useMatch({ from: '/{-$locale}', shouldThrow: false });
  const locale = localeMatch?.context.locale ?? CANONICAL_LOCALE;

  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <AnalyticsTracker />
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
