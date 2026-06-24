import { createFileRoute } from '@tanstack/react-router';

// Reverse proxy for PostHog ingestion (`/info/e/`, `/info/flags/`, `/info/array/<token>/config`, ...).
// PostHog reads config over GET and sends events over POST. The handler is dynamically imported so the
// proxy and @pkg/schema hosts stay off the client bundle.
export const Route = createFileRoute('/info/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { proxyPosthogIngest } = await import('../../server/analytics/posthog-proxy.js');

        return proxyPosthogIngest(request);
      },
      POST: async ({ request }) => {
        const { proxyPosthogIngest } = await import('../../server/analytics/posthog-proxy.js');

        return proxyPosthogIngest(request);
      },
    },
  },
});
