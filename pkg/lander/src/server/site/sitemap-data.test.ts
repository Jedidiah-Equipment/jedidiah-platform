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

async function insertRange(db: Db, suffix: string) {
  const [range] = await db
    .insert(productRanges)
    .values({ name: `Crosshaul ${suffix} Range`, displayOrder: 0 })
    .returning();
  if (!range) throw new Error('range insert did not return a row');

  return range;
}

// A stored translation envelope, which is what carries the timestamp a translated page is dated by.
function envelope(value: string, translatedAt: string) {
  return { isManual: true, sourceHash: 'hash', translatedAt, value };
}

// A timestamp comfortably after the row's own, so "newest" has one unambiguous answer.
function isoAfter(instant: Date): string {
  return new Date(instant.getTime() + 60_000).toISOString();
}

async function entryFor(db: Db, path: string) {
  return (await listSitemapEntries(db)).find((entry) => entry.path === path);
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

test('dates a Product entry by its own row', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, suffix);
  const product = await insertProduct(db, range.id, { name: `CH14 ${suffix}`, modelCode: `CH14-${suffix}` });

  const entry = await entryFor(db, `/products/${encodeURIComponent(`CH14-${suffix}`)}`);

  expect(entry?.lastModified).toBe(product.updatedAt.toISOString());
});

// The translation write paths set only the `translations` column, so `updatedAt` does not move when the
// Afrikaans copy changes. Dating the page by `updatedAt` alone would pin the `/af/` URL to the last English
// edit and never move for the change a crawler is being asked to come back for.
test('moves a Product entry when only its translation changed', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, suffix);
  const product = await insertProduct(db, range.id, { name: `CH14 ${suffix}`, modelCode: `CH14-${suffix}` });
  const translatedAt = isoAfter(product.updatedAt);

  await db
    .update(products)
    .set({ translations: { af: { name: envelope('Houtsleepwa', translatedAt) } } })
    .where(eq(products.id, product.id));

  const entry = await entryFor(db, `/products/${encodeURIComponent(`CH14-${suffix}`)}`);

  expect(entry?.lastModified).toBe(translatedAt);
});

// Assembly names translate into a different table entirely, so this one cannot be caught by watching the
// Product row at all — and it still changes the page that renders those names.
test('moves a Product entry when only an Assembly translation changed', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, suffix);
  const product = await insertProduct(db, range.id, { name: `CH14 ${suffix}`, modelCode: `CH14-${suffix}` });
  const translatedAt = isoAfter(product.updatedAt);

  await db
    .update(productAssemblies)
    .set({ translations: { af: { name: envelope('Raam', translatedAt) } } })
    .where(eq(productAssemblies.productId, product.id));

  const entry = await entryFor(db, `/products/${encodeURIComponent(`CH14-${suffix}`)}`);

  expect(entry?.lastModified).toBe(translatedAt);
});

// `/products` is as fresh as its newest Product, but unpublishing that Product removes it from the set the
// maximum is taken over — so the index's date would move *backwards* on the edit that changed it. An absent
// element beats one that lies about direction, so the index is undated like the dictionary-backed pages.
test('leaves the index and the dictionary-backed pages undated', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, suffix);
  await insertProduct(db, range.id, { name: `CH14 ${suffix}`, modelCode: `CH14-${suffix}` });

  const entries = await listSitemapEntries(db);

  for (const path of ['/', '/products', '/about', '/contact']) {
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
