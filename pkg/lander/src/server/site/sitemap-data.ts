import { listAllProducts } from '@pkg/core';
import type { Db } from '@pkg/db';
import { isLanderReady } from '@pkg/domain';
import { LOCALES, localePath } from '../../lib/locale.js';
import { SITE_URL } from '../../lib/seo.js';

// The crawlable static pages, in nav order. Product detail URLs are appended from live data.
export const SITEMAP_STATIC_PATHS = ['/', '/products', '/about', '/contact'] as const;

export type SitemapEntry = {
  path: string;
  /**
   * W3C-datetime `lastmod`, omitted when nothing in the data can honestly date the page. Search engines use
   * it to decide what is worth re-crawling and in what order, but only for as long as it stays accurate — a
   * value that moves on every deploy teaches them to disregard the element across the whole site. So a page
   * whose copy lives in the static dictionaries carries none rather than a manufactured timestamp.
   */
  lastModified?: string;
};

// Lists every site-relative URL the sitemap should enumerate: the static pages plus one entry per
// lander-ready Product detail URL, keyed by model code like the route (`/products/:modelCode`). Only
// lander-ready Products are listed — an unready Product's detail page 404s, so listing it would point
// crawlers at a dead URL. Sorted deterministically so the generated XML is stable across requests.
export async function listSitemapEntries(db: Db): Promise<SitemapEntry[]> {
  const landerReady = (await listAllProducts({ db })).filter(isLanderReady);

  const productEntries = landerReady
    .slice()
    .sort((left, right) => left.modelCode.localeCompare(right.modelCode))
    .map((product) => ({
      path: `/products/${encodeURIComponent(product.modelCode)}`,
      lastModified: product.updatedAt,
    }));

  // The index renders every Product, so it is exactly as fresh as the most recently edited one.
  const catalogLastModified = newest(landerReady.map((product) => product.updatedAt));

  return [
    ...SITEMAP_STATIC_PATHS.map((path) => ({
      path,
      ...(path === '/products' && catalogLastModified ? { lastModified: catalogLastModified } : {}),
    })),
    ...productEntries,
  ];
}

// Renders both Locale trees for every crawlable entry. Paths are already percent-encoded by
// listSitemapEntries, so no further XML escaping of the origin is needed.
//
// Both Locale variants of a Product share its `lastModified`, which is accurate rather than convenient:
// translations are a `jsonb` column on the Product row, so editing either language moves the same row's
// `updatedAt`.
export function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .flatMap(({ lastModified, path }) => LOCALES.map((locale) => ({ lastModified, path: localePath(path, locale) })))
    .map(({ lastModified, path }) =>
      [
        '  <url>',
        `    <loc>${SITE_URL}${path}</loc>`,
        ...(lastModified ? [`    <lastmod>${lastModified}</lastmod>`] : []),
        '  </url>',
      ].join('\n'),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// The most recent of a set of ISO-8601 timestamps. They are all UTC from the same serializer, so ordering
// them as strings orders them as instants.
function newest(timestamps: string[]): string | undefined {
  return timestamps.reduce<string | undefined>(
    (latest, candidate) => (latest === undefined || candidate > latest ? candidate : latest),
    undefined,
  );
}
