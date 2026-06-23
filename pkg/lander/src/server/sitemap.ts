import { getDb } from './db.js';
import { listSitemapPaths, renderSitemap } from './sitemap-data.js';

// A generated sitemap converges quickly after a catalog change, so a short shared cache softens repeat
// crawler hits without pinning stale URLs.
const SITEMAP_CACHE_CONTROL = 'public, max-age=3600';

// Server-only handler for the public /sitemap.xml route. Kept out of the route module so @pkg/core and the
// Postgres client stay off the client route-tree bundle (mirrors the image and brochure routes).
export async function serveSitemap(): Promise<Response> {
  const xml = renderSitemap(await listSitemapPaths(getDb()));

  return new Response(xml, {
    status: 200,
    headers: {
      'cache-control': SITEMAP_CACHE_CONTROL,
      'content-type': 'application/xml; charset=utf-8',
    },
  });
}
