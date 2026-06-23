import { createFileRoute } from '@tanstack/react-router';

// Generated sitemap enumerating the static pages plus every Product detail URL from live data. The handler
// is dynamically imported so @pkg/core and the Postgres client stay off the client route-tree bundle.
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const { serveSitemap } = await import('../server/sitemap.js');

        return serveSitemap();
      },
    },
  },
});
