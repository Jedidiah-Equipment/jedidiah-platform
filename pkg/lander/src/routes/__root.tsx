import faviconUrl from '@pkg/domain/assets/brand/jedidiah-favicon-yellow.png';
import barlowRegularUrl from '@pkg/domain/fonts/barlow/Barlow-Regular-latin.woff2';
import sairaBoldUrl from '@pkg/domain/fonts/saira-condensed/SairaCondensed-Bold-latin.woff2';
import sairaExtraBoldUrl from '@pkg/domain/fonts/saira-condensed/SairaCondensed-ExtraBold-latin.woff2';
import { createRootRoute, HeadContent, Outlet, Scripts, useMatch, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { initAnalytics, initAnalyticsWhenIdle } from '../lib/analytics.js';
import { CANONICAL_LOCALE, type Locale } from '../lib/locale.js';
import { absoluteUrl, DEFAULT_OG_IMAGE, OG_IMAGE_META } from '../lib/seo.js';
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
      ...OG_IMAGE_META,
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
    ],
    links: [
      { rel: 'icon', type: 'image/png', href: faviconUrl },
      // The faces that set the first screenful — display 800 for the page heading, display 700 for buttons
      // and section headings, body 400 for prose. The remaining faces are declared in the stylesheet and
      // load on demand. Fonts are always fetched in CORS mode, so an uncredentialed preload needs
      // `crossOrigin` to match the later request and not fetch twice.
      ...[sairaExtraBoldUrl, sairaBoldUrl, barlowRegularUrl].map(
        (href) => ({ rel: 'preload', as: 'font', type: 'font/woff2', href, crossOrigin: 'anonymous' }) as const,
      ),
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootDocument,
});

// Initialises PostHog once the browser is idle. Pageviews — including SPA route changes — are captured by
// posthog-js itself via `capture_pageview: 'history_change'` (set by the `defaults` snapshot), so no manual
// wiring is needed. No-ops entirely when PostHog is unset.
function AnalyticsTracker({ locale }: { locale: Locale }) {
  const router = useRouter();

  useEffect(() => {
    const cancelIdle = initAnalyticsWhenIdle(locale);
    // A client navigation rewrites the URL before PostHog would otherwise start, and PostHog's first
    // pageview reports whatever URL is current when it loads. Without this, a visitor who follows an
    // untracked link inside the deferral window has their landing page recorded as the destination — the
    // one attribution a campaign cannot afford to lose. `onBeforeNavigate` fires while the landing URL is
    // still the current one; init is idempotent, so this is a no-op once analytics is already running.
    const unsubscribe = router.subscribe('onBeforeNavigate', () => initAnalytics(locale));

    return () => {
      cancelIdle();
      unsubscribe();
    };
  }, [locale, router]);

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
        <AnalyticsTracker locale={locale} />
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
