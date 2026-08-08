import { eq, productAssemblies, productRanges, products } from '@pkg/db';
import { describe, expect } from 'vitest';

import { SITE_URL } from '../../lib/seo.js';
import { test } from '../../test/tester.js';
import { listSitemapEntries, renderSitemap, SITEMAP_STATIC_PATHS } from './sitemap-data.js';

type Db = Parameters<typeof listSitemapEntries>[0];

function imageRef(slot: string) {
  return {
    byteSize: 1024,
    contentType: 'image/png',
    storageKey: `products/${slot}-${crypto.randomUUID()}.png`,
    updatedAt: new Date().toISOString(),
  };
}

// Inserts a lander-ready Product (so it appears in the sitemap) unless `landerEnabled` is overridden off.
async function insertProduct(
  db: Db,
  rangeId: string,
  values: { name: string; modelCode: string; landerEnabled?: boolean },
) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 5,
      rangeId,
      landerEnabled: true,
      category: 'Default category',
      keyFeatures: ['Default feature'],
      description: 'Default description.',
      images: { primary: imageRef('primary'), secondary1: imageRef('secondary1'), secondary2: imageRef('secondary2') },
      ...values,
    })
    .returning();
  if (!product) throw new Error('product insert did not return a row');

  await db
    .insert(productAssemblies)
    .values({ productId: product.id, kind: 'standard', name: 'Frame', displayOrder: 0 });

  return product;
}

test('listSitemapPaths lists the static pages plus every lander-ready Product, skipping unready ones', async ({
  db,
}) => {
  const suffix = crypto.randomUUID();
  const [range] = await db
    .insert(productRanges)
    .values({ name: `Crosshaul ${suffix} Range`, displayOrder: 0 })
    .returning();
  if (!range) throw new Error('range insert did not return a row');

  await insertProduct(db, range.id, { name: `CH14 ${suffix}`, modelCode: `CH14-${suffix}` });
  // Publish toggle off: its detail page 404s, so it must not appear in the sitemap.
  await insertProduct(db, range.id, { name: `CH12 ${suffix}`, modelCode: `CH12-${suffix}`, landerEnabled: false });

  const entries = await listSitemapEntries(db);
  const paths = entries.map((entry) => entry.path);

  for (const staticPath of SITEMAP_STATIC_PATHS) {
    expect(paths).toContain(staticPath);
  }
  expect(paths).toContain(`/products/${encodeURIComponent(`CH14-${suffix}`)}`);
  expect(paths).not.toContain(`/products/${encodeURIComponent(`CH12-${suffix}`)}`);
});

test('dates a Product entry by its own row, and the index by the freshest of them', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const [range] = await db
    .insert(productRanges)
    .values({ name: `Crosshaul ${suffix} Range`, displayOrder: 0 })
    .returning();
  if (!range) throw new Error('range insert did not return a row');

  const older = await insertProduct(db, range.id, { name: `CH14 ${suffix}`, modelCode: `CH14-${suffix}` });
  const newer = await insertProduct(db, range.id, { name: `CH16 ${suffix}`, modelCode: `CH16-${suffix}` });
  // Move one row's clock forward so "freshest" has a single unambiguous answer.
  const movedOn = new Date(Date.now() + 60_000);
  await db.update(products).set({ updatedAt: movedOn }).where(eq(products.id, newer.id));

  const entries = await listSitemapEntries(db);
  const entryFor = (path: string) => entries.find((entry) => entry.path === path);

  expect(entryFor(`/products/${encodeURIComponent(`CH14-${suffix}`)}`)?.lastModified).toBe(
    older.updatedAt.toISOString(),
  );
  expect(entryFor(`/products/${encodeURIComponent(`CH16-${suffix}`)}`)?.lastModified).toBe(movedOn.toISOString());
  // The index renders every Product, so it inherits the most recently edited one.
  expect(entryFor('/products')?.lastModified).toBe(movedOn.toISOString());
});

// A page whose copy lives in the static dictionaries has no data-driven date. Emitting one anyway would move
// it on every deploy, and an inaccurate lastmod is worse than none — search engines stop trusting the
// element site-wide rather than per-URL.
test('leaves the dictionary-backed pages undated', async ({ db }) => {
  const entries = await listSitemapEntries(db);

  for (const path of ['/', '/about', '/contact']) {
    expect(entries.find((entry) => entry.path === path)?.lastModified, path).toBeUndefined();
  }
});

describe('renderSitemap', () => {
  test('emits canonical and Afrikaans URLs for every sitemap path', () => {
    const xml = renderSitemap([{ path: '/' }, { path: '/products/CH14' }]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>${SITE_URL}/</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/af</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/products/CH14</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/af/products/CH14</loc>`);
  });

  test('gives both Locale trees the same lastmod, since one row backs both', () => {
    const xml = renderSitemap([{ path: '/products/CH14', lastModified: '2026-08-07T09:00:00.000Z' }]);

    expect(xml).toContain(
      `  <url>\n    <loc>${SITE_URL}/products/CH14</loc>\n    <lastmod>2026-08-07T09:00:00.000Z</lastmod>\n  </url>`,
    );
    expect(xml).toContain(
      `  <url>\n    <loc>${SITE_URL}/af/products/CH14</loc>\n    <lastmod>2026-08-07T09:00:00.000Z</lastmod>\n  </url>`,
    );
  });

  test('omits the element entirely for an undated entry, rather than emitting it empty', () => {
    const xml = renderSitemap([{ path: '/about' }]);

    expect(xml).not.toContain('<lastmod>');
    expect(xml).toContain(`  <url>\n    <loc>${SITE_URL}/about</loc>\n  </url>`);
  });
});
