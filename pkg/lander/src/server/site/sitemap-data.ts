import { listAllProducts } from '@pkg/core/equipment';
import type { Db } from '@pkg/db';
import { isLanderReady } from '@pkg/domain/equipment';
import type { Product, ProductAssemblyTranslations, ProductTranslations } from '@pkg/schema/equipment';
import { LOCALES, localePath } from '@/lib/locale.js';
import { SITE_URL } from '@/lib/seo.js';

// The crawlable static pages, in nav order. Product detail URLs are appended from live data.
export const SITEMAP_STATIC_PATHS = ['/', '/products', '/about', '/contact'] as const;

export type SitemapEntry = {
  path: string;
  /**
   * W3C-datetime `lastmod`, omitted when nothing in the data can honestly date the page. Search engines use
   * it to decide what is worth re-crawling and in what order, but only for as long as it stays accurate — a
   * value that moves on every deploy, or one that moves backwards, teaches them to disregard the element
   * across the whole site. Only the Product pages carry one; see `listSitemapEntries` for why the index and
   * the dictionary-backed pages do not.
   */
  lastModified?: string;
};

// Lists every site-relative URL the sitemap should enumerate: the static pages plus one entry per
// lander-ready Product detail URL, keyed by model code like the route (`/products/:modelCode`). Only
// lander-ready Products are listed — an unready Product's detail page 404s, so listing it would point
// crawlers at a dead URL. Sorted deterministically so the generated XML is stable across requests.
//
// Only the Product pages are dated. `/products` looks like it should be — it is as fresh as its newest
// Product — but the events that change it include a Product leaving the visible set, which the visible set
// cannot witness: unpublishing the newest one would drop the maximum back to an older Product and move the
// page's `lastmod` backwards on the very edit that changed it. Widening the maximum to every Product fixes
// the direction and breaks the meaning instead, moving the index whenever an unpublished draft is touched.
// Neither is worth shipping over an absent element. `/`, `/about` and `/contact` are undated for the plainer
// reason that their copy lives in the static dictionaries, where nothing in the data dates them at all.
export async function listSitemapEntries(db: Db): Promise<SitemapEntry[]> {
  const landerReady = (await listAllProducts({ db })).filter(isLanderReady);

  const productEntries = landerReady
    .slice()
    .sort((left, right) => left.modelCode.localeCompare(right.modelCode))
    .map((product) => {
      const lastModified = productLastModified(product);

      return {
        path: `/products/${encodeURIComponent(product.modelCode)}`,
        // Spread rather than assigned: the key is absent when there is no date, not present and undefined.
        ...(lastModified ? { lastModified } : {}),
      };
    });

  return [...SITEMAP_STATIC_PATHS.map((path) => ({ path })), ...productEntries];
}

// When a Product's rendered pages last changed, across every source that feeds them.
//
// `updatedAt` alone is not that instant. It moves only when a write sets it, and the translation paths do
// not: they set the `translations` column and nothing else, while Assembly names translate into a separate
// table. Dating an `/af/` page by `updatedAt` would therefore hold it at the last English edit and never
// move when the Afrikaans copy actually changed. Every stored envelope carries its own `translatedAt`, so
// the honest answer is the newest of all of them and the row's own timestamp.
function productLastModified(product: Product): string | undefined {
  return newest([
    product.updatedAt,
    ...translationTimestamps(product.translations),
    ...product.assemblies.flatMap((assembly) => translationTimestamps(assembly.translations)),
  ]);
}

// Every `translatedAt` held in a stored translations column, across each Locale and field. Walked
// structurally rather than field by field, so adding a translatable field cannot quietly stop dating the
// page it renders on.
function translationTimestamps(translations: ProductTranslations | ProductAssemblyTranslations | undefined): string[] {
  return Object.values(translations ?? {}).flatMap((fields) =>
    // A stored translations object is partial in both directions: a Locale may be absent, and within one,
    // any field may be untranslated.
    Object.values(fields ?? {}).flatMap((envelope) => (envelope ? [envelope.translatedAt] : [])),
  );
}

// Renders both Locale trees for every crawlable entry. Paths are already percent-encoded by
// listSitemapEntries, so no further XML escaping of the origin is needed.
//
// Both Locale variants of a Product share its `lastModified`. That is accurate rather than convenient: the
// value already folds in every translation's own timestamp, so it moves for a change to either language.
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
