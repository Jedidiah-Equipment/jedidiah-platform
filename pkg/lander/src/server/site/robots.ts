import { SITE_URL } from '../../lib/seo.js';
import { isSiteIndexable } from './site-indexable.js';

// Production invites every crawler and advertises the sitemap. Every other environment (staging,
// development) disallows all crawling so the site never lands in search results.
export function renderRobots(indexable: boolean): string {
  if (!indexable) {
    return 'User-agent: *\nDisallow: /\n';
  }

  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

// Server-only handler for /robots.txt. Reads the indexing gate at request time so the response matches the
// environment serving it. Kept out of the route module so the config/env deps stay off the client bundle.
export function serveRobots(): Response {
  return new Response(renderRobots(isSiteIndexable()), {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
