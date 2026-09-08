import { createRouter as createTanStackRouter } from '@tanstack/react-router';

import { LanderErrorPage } from './components/error-page.js';
import { captureAnalyticsException } from './lib/analytics.js';
import { routeTree } from './routeTree.gen.js';

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    // A route loader that throws (not a notFound) would otherwise fall through to TanStack Router's blank
    // default error screen. Show a branded page with a retry, and report the swallowed error to PostHog so
    // the underlying transient failure is no longer invisible.
    defaultErrorComponent: LanderErrorPage,
    defaultOnCatch: captureAnalyticsException,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
