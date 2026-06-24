import { createFileRoute } from '@tanstack/react-router';

// Allows or disallows crawling depending on the environment (production crawls, everything else is blocked).
// The handler is dynamically imported so the config/env deps stay off the client route-tree bundle.
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const { serveRobots } = await import('../server/site/robots.js');

        return serveRobots();
      },
    },
  },
});
