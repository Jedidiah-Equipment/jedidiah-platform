import { productRanges, products } from '@pkg/db';
import { describe, expect } from 'vitest';

import { SITE_URL } from '../lib/seo.js';
import { test } from '../test/tester.js';
import { listSitemapPaths, renderSitemap, SITEMAP_STATIC_PATHS } from './sitemap-data.js';

test('listSitemapPaths returns the static pages plus every Product detail URL', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const [range] = await db
    .insert(productRanges)
    .values({ name: `Crosshaul ${suffix} Range` })
    .returning();
  if (!range) throw new Error('range insert did not return a row');

  await db.insert(products).values([
    { basePrice: 1000, buildTimeDays: 5, rangeId: range.id, name: `CH14 ${suffix}`, modelCode: `CH14-${suffix}` },
    { basePrice: 1000, buildTimeDays: 5, rangeId: range.id, name: `CH12 ${suffix}`, modelCode: `CH12-${suffix}` },
  ]);

  const paths = await listSitemapPaths(db);

  for (const staticPath of SITEMAP_STATIC_PATHS) {
    expect(paths).toContain(staticPath);
  }
  expect(paths).toContain(`/products/${encodeURIComponent(`CH14-${suffix}`)}`);
  expect(paths).toContain(`/products/${encodeURIComponent(`CH12-${suffix}`)}`);
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
