import { createFileRoute } from '@tanstack/react-router';

import { SITE_URL } from '../lib/seo.js';

// Allow every crawler everywhere and point them at the generated sitemap. No server-only deps, so the body
// is built inline rather than behind a dynamic import.
const ROBOTS_BODY = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(ROBOTS_BODY, {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
    },
  },
});
