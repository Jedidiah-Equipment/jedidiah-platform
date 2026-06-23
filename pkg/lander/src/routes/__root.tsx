import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { useEffect } from 'react';

import { Footer } from '../components/footer.js';
import { Nav } from '../components/nav.js';
import { initAnalytics } from '../lib/analytics.js';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../lib/seo.js';
import { getSiteMeta } from '../server/site-meta.js';
import appCss from '../styles/app.css?url';

export const Route = createRootRoute({
  loader: () => getSiteMeta(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Jedidiah Equipment — South African Built. Farmer Proven.' },
      {
        name: 'description',
        content:
          'Heavy-duty agricultural equipment engineered to perform in South African conditions. Browse the Jedidiah Equipment range.',
      },
      // Keep non-production environments (staging, development) out of search results. The robots.txt route
      // already disallows crawling there; this adds a defence-in-depth noindex for any page fetched directly.
      ...(loaderData?.indexable === false ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
      // Site-wide Open Graph / Twitter defaults. Per-page heads override title, description, image and url
      // (matched by name/property), so these act as the fallback for any page that doesn't set its own.
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Jedidiah Equipment' },
      { property: 'og:title', content: 'Jedidiah Equipment' },
      {
        property: 'og:description',
        content: 'Heavy-duty agricultural equipment engineered to perform in South African conditions.',
      },
      { property: 'og:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
    ],
    links: [
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
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AnalyticsTracker />
        <Nav />
        <Outlet />
        <Footer />
        <Scripts />
      </body>
    </html>
  );
}
