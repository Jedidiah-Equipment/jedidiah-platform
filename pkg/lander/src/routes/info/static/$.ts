import { createFileRoute } from '@tanstack/react-router';

// Reverse proxy for PostHog static assets. More specific than `/info/$`, so `/info/static/*` resolves here
// and forwards to the asset host. The handler is dynamically imported to keep it off the client bundle.
export const Route = createFileRoute('/info/static/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { proxyPosthogAssets } = await import('../../../server/analytics/posthog-proxy.js');

        return proxyPosthogAssets(request);
      },
    },
  },
});
