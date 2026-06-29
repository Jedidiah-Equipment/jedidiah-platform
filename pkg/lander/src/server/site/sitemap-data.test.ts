import { productAssemblies, productRanges, products } from '@pkg/db';
import { describe, expect } from 'vitest';

import { SITE_URL } from '../../lib/seo.js';
import { test } from '../../test/tester.js';
import { listSitemapPaths, renderSitemap, SITEMAP_STATIC_PATHS } from './sitemap-data.js';

type Db = Parameters<typeof listSitemapPaths>[0];

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
      technicalDetails: [{ label: 'Working Width', value: '7 m' }],
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

  const paths = await listSitemapPaths(db);

  for (const staticPath of SITEMAP_STATIC_PATHS) {
    expect(paths).toContain(staticPath);
  }
  expect(paths).toContain(`/products/${encodeURIComponent(`CH14-${suffix}`)}`);
  expect(paths).not.toContain(`/products/${encodeURIComponent(`CH12-${suffix}`)}`);
});

describe('renderSitemap', () => {
  test('emits a urlset with an absolute loc per path', () => {
    const xml = renderSitemap(['/', '/products/CH14']);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>${SITE_URL}/</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/products/CH14</loc>`);
  });
});
