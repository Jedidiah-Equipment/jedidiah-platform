import { listProductRanges } from '@pkg/core';
import { productAssemblies, productRanges, products } from '@pkg/db';
import { expect } from 'vitest';

import { test } from '../../test/tester.js';
import { toRangeLabel, toRangeSlug } from './products-data.js';
import { loadFooterRanges, loadHomeRanges, loadProductRangeCount, loadRangeOptions } from './ranges-data.js';

type Db = Parameters<typeof loadHomeRanges>[0];

function imageRef(slot: string) {
  return {
    byteSize: 1024,
    contentType: 'image/png',
    storageKey: `products/${slot}-${crypto.randomUUID()}.png`,
    updatedAt: new Date().toISOString(),
  };
}

async function insertReadyProduct(db: Db, rangeId: string, suffix = crypto.randomUUID()) {
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
      name: `Visible product ${suffix}`,
      modelCode: `VR-${suffix}`,
    })
    .returning();
  if (!product) throw new Error('product insert did not return a row');

  await db
    .insert(productAssemblies)
    .values({ productId: product.id, kind: 'standard', name: 'Frame', displayOrder: 0 });

  return product;
}

test('Range loaders translate display text while preserving canonical filter slugs', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const [range] = await db
    .insert(productRanges)
    .values({
      name: `Crosshaul ${suffix} Range`,
      description: 'Canonical range description.',
      displayOrder: 0,
      translations: {
        af: {
          sourceHash: 'stale-range-hash',
          translatedAt: '2026-07-13T10:00:00.000Z',
          name: `Dwarsvervoer ${suffix} Reeks`,
          description: null,
        },
      },
    })
    .returning();
  if (!range) throw new Error('insert did not return a row');
  await insertReadyProduct(db, range.id);

  const homeRange = (await loadHomeRanges(db, 'af')).find((candidate) => candidate.id === range.id);
  const footerRange = (await loadFooterRanges(db, 'af')).find(
    (candidate) => candidate.slug === toRangeSlug(range.name),
  );

  expect(homeRange).toMatchObject({
    name: `Dwarsvervoer ${suffix} Reeks`,
    description: 'Canonical range description.',
    slug: toRangeSlug(range.name),
  });
  expect(footerRange).toEqual({ label: `Dwarsvervoer ${suffix} Reeks`, slug: toRangeSlug(range.name) });
  expect(await loadRangeOptions(db, 'af')).toContain(`Dwarsvervoer ${suffix} Reeks`);

  expect((await loadHomeRanges(db, 'en')).find((candidate) => candidate.id === range.id)).toMatchObject({
    name: range.name,
    description: 'Canonical range description.',
    slug: toRangeSlug(range.name),
  });
});

test('loadHomeRanges returns Range name, blurb, and Products href from the database', async ({ db }) => {
  const [withBlurb] = await db
    .insert(productRanges)
    .values({
      name: `Lander Test Range ${crypto.randomUUID()}`,
      description: 'Field-proven and built tough.',
      displayOrder: 0,
    })
    .returning();
  if (!withBlurb) throw new Error('insert did not return a row');
  await insertReadyProduct(db, withBlurb.id);

  const ranges = await loadHomeRanges(db, 'en');
  const found = ranges.find((range) => range.id === withBlurb.id);

  expect(found).toEqual({
    id: withBlurb.id,
    name: withBlurb.name,
    description: 'Field-proven and built tough.',
    href: '/products',
    slug: toRangeSlug(withBlurb.name),
    imageUrl: `/images/ranges/${withBlurb.id}`,
  });
});

test('loadHomeRanges renders a missing blurb as empty rather than fabricating copy', async ({ db }) => {
  const [withoutBlurb] = await db
    .insert(productRanges)
    .values({ name: `Lander Blank Range ${crypto.randomUUID()}`, description: null, displayOrder: 0 })
    .returning();
  if (!withoutBlurb) throw new Error('insert did not return a row');
  await insertReadyProduct(db, withoutBlurb.id);

  const ranges = await loadHomeRanges(db, 'en');
  const found = ranges.find((range) => range.id === withoutBlurb.id);

  expect(found?.description).toBe('');
});

test('loadHomeRanges omits Ranges without lander-ready Products', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const [emptyRange] = await db
    .insert(productRanges)
    .values({ name: `Home Empty Range ${suffix}`, description: 'No visible models.', displayOrder: 0 })
    .returning();
  const [hiddenRange] = await db
    .insert(productRanges)
    .values({ name: `Home Hidden Range ${suffix}`, description: 'Hidden models only.', displayOrder: 0 })
    .returning();
  if (!emptyRange || !hiddenRange) throw new Error('range insert did not return a row');

  await db.insert(products).values({
    basePrice: 1000,
    buildTimeDays: 5,
    rangeId: hiddenRange.id,
    landerEnabled: false,
    category: 'Default category',
    keyFeatures: ['Default feature'],
    technicalDetails: [{ label: 'Working Width', value: '7 m' }],
    description: 'Default description.',
    images: { primary: imageRef('primary'), secondary1: imageRef('secondary1'), secondary2: imageRef('secondary2') },
    name: `Hidden product ${suffix}`,
    modelCode: `HR-${suffix}`,
  });

  const ranges = await loadHomeRanges(db, 'en');

  expect(ranges.some((range) => range.id === emptyRange.id)).toBe(false);
  expect(ranges.some((range) => range.id === hiddenRange.id)).toBe(false);
});

test('loadFooterRanges returns the top four Ranges as chip-matching label/slug links', async ({ db }) => {
  const { ranges } = await listProductRanges({ db });
  const footer = await loadFooterRanges(db, 'en');

  // Footer teaser: the first four Ranges by display order, mapped through the same label/slug helpers the
  // Products chip bar and `?range=` filter use, so the links land on the matching filter.
  expect(footer).toHaveLength(Math.min(4, ranges.length));
  expect(footer).toEqual(
    ranges.slice(0, 4).map((range) => ({ label: toRangeLabel(range.name), slug: toRangeSlug(range.name) })),
  );
});

test('loadProductRangeCount returns the current number of Product Ranges', async ({ db }) => {
  const { ranges } = await listProductRanges({ db });

  expect(await loadProductRangeCount(db)).toBe(ranges.length);
});
