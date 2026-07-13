import { listAllProducts } from '@pkg/core';
import type { Db } from '@pkg/db';
import { isLanderReady } from '@pkg/domain';
import { LOCALES, localePath } from '../../lib/locale.js';
import { SITE_URL } from '../../lib/seo.js';

// The crawlable static pages, in nav order. Product detail URLs are appended from live data.
export const SITEMAP_STATIC_PATHS = ['/', '/products', '/about', '/contact'] as const;

// Lists every site-relative path the sitemap should enumerate: the static pages plus one entry per
// lander-ready Product detail URL, keyed by model code like the route (`/products/:modelCode`). Only
// lander-ready Products are listed — an unready Product's detail page 404s, so listing it would point
// crawlers at a dead URL. Sorted deterministically so the generated XML is stable across requests.
export async function listSitemapPaths(db: Db): Promise<string[]> {
  const products = await listAllProducts({ db });

  const productPaths = products
    .filter(isLanderReady)
    .map((product) => product.modelCode)
    .sort((a, b) => a.localeCompare(b))
    .map((modelCode) => `/products/${encodeURIComponent(modelCode)}`);

  return [...SITEMAP_STATIC_PATHS, ...productPaths];
}

// Renders both Locale trees for every crawlable path. Paths are already percent-encoded by
// listSitemapPaths, so no further XML escaping of the origin is needed.
export function renderSitemap(paths: string[]): string {
  const localizedPaths = paths.flatMap((path) => LOCALES.map((locale) => localePath(path, locale)));
  const urls = localizedPaths.map((path) => `  <url>\n    <loc>${SITE_URL}${path}</loc>\n  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
