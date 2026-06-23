import type { Db } from '@pkg/db';

import { SITE_URL } from '../lib/seo.js';

// The crawlable static pages, in nav order. Product detail URLs are appended from live data.
export const SITEMAP_STATIC_PATHS = ['/', '/products', '/about', '/contact'] as const;

// Lists every site-relative path the sitemap should enumerate: the static pages plus one entry per Product
// detail URL, keyed by model code like the route (`/products/:modelCode`). Reads only the model code — the
// marketing catalog is small and this is the unauthenticated surface — and sorts deterministically so the
// generated XML is stable across requests.
export async function listSitemapPaths(db: Db): Promise<string[]> {
  const rows = await db.query.products.findMany({ columns: { modelCode: true } });

  const productPaths = rows
    .map((row) => row.modelCode)
    .sort((a, b) => a.localeCompare(b))
    .map((modelCode) => `/products/${encodeURIComponent(modelCode)}`);

  return [...SITEMAP_STATIC_PATHS, ...productPaths];
}

// Renders the urlset XML for a list of site-relative paths. Each `<loc>` is the absolute URL; paths are
// already percent-encoded by listSitemapPaths, so no further XML escaping of the origin is needed.
export function renderSitemap(paths: string[]): string {
  const urls = paths.map((path) => `  <url>\n    <loc>${SITE_URL}${path}</loc>\n  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
