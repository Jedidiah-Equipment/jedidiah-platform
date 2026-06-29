import { productAssemblies, productRanges, products } from '@pkg/db';
import { expect } from 'vitest';

import { test } from '../../test/tester.js';
import { loadProductsCatalog, toRangeSlug } from './products-data.js';

type Db = Parameters<typeof loadProductsCatalog>[0];

function imageRef(slot: string) {
  return {
    byteSize: 1024,
    contentType: 'image/png',
    storageKey: `products/${slot}-${crypto.randomUUID()}.png`,
    updatedAt: new Date().toISOString(),
  };
}

async function insertRange(db: Db, name: string, description: string | null) {
  const existing = await db.select({ id: productRanges.id }).from(productRanges);
  const [range] = await db
    .insert(productRanges)
    .values({ name, description, displayOrder: existing.length })
    .returning();
  if (!range) throw new Error('range insert did not return a row');

  return range;
}

// Inserts a fully lander-ready Product (publish toggle on, gallery images, category, key feature, description,
// and one standard assembly) so it surfaces in the catalog. Tests override values to make it not ready.
async function insertProduct(
  db: Db,
  rangeId: string,
  values: { name: string; modelCode: string; description?: string | null; landerEnabled?: boolean },
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

test('toRangeSlug builds URL-safe slugs from Range names', () => {
  expect(toRangeSlug('Crosshaul Range')).toBe('crosshaul-range');
  expect(toRangeSlug('Silage & Grain Range')).toBe('silage-grain-range');
});

test('loadProductsCatalog groups Products under their Range with a model count', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Crosshaul ${suffix} Range`, 'Tipping trailers built tough.');
  const product = await insertProduct(db, range.id, {
    name: `CH14 Tipping Trailer ${suffix}`,
    modelCode: `CH14-${suffix}`,
    description: 'Flagship 14-ton tipping trailer.',
  });
  await insertProduct(db, range.id, { name: `CH12 Tipping Trailer ${suffix}`, modelCode: `CH12-${suffix}` });

  const { groups } = await loadProductsCatalog(db);
  const group = groups.find((candidate) => candidate.id === range.id);

  expect(group).toBeDefined();
  expect(group?.count).toBe(2);
  expect(group?.label).toBe(`Crosshaul ${suffix}`);
  expect(group?.slug).toBe(toRangeSlug(range.name));
  expect(group?.description).toBe('Tipping trailers built tough.');

  const card = group?.products.find((candidate) => candidate.id === product.id);
  expect(card).toEqual({
    id: product.id,
    name: product.name,
    modelCode: product.modelCode,
    description: 'Flagship 14-ton tipping trailer.',
    href: `/products/${encodeURIComponent(product.modelCode)}`,
    imageUrl: `/images/products/${product.id}`,
  });
});

test('loadProductsCatalog omits Products that are not lander-ready', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Recharge Range ${suffix}`, null);
  const ready = await insertProduct(db, range.id, { name: `Recharge Tank ${suffix}`, modelCode: `RC-${suffix}` });
  // Same range, but with the publish toggle off it must not surface as a catalog card.
  const hidden = await insertProduct(db, range.id, {
    name: `Recharge Drum ${suffix}`,
    modelCode: `RCD-${suffix}`,
    landerEnabled: false,
  });

  const { groups } = await loadProductsCatalog(db);
  const group = groups.find((candidate) => candidate.id === range.id);

  expect(group?.count).toBe(1);
  expect(group?.products.map((card) => card.id)).toEqual([ready.id]);
  expect(group?.products.some((card) => card.id === hidden.id)).toBe(false);
});

test('loadProductsCatalog omits Ranges whose only Products are not lander-ready', async ({ db }) => {
  const emptyRange = await insertRange(db, `Empty Range ${crypto.randomUUID()}`, 'No models yet.');
  const unreadyRange = await insertRange(db, `Unready Range ${crypto.randomUUID()}`, 'Drafts only.');
  await insertProduct(db, unreadyRange.id, {
    name: `Draft ${crypto.randomUUID()}`,
    modelCode: `DR-${crypto.randomUUID()}`,
    landerEnabled: false,
  });

  const { groups } = await loadProductsCatalog(db);

  expect(groups.some((group) => group.id === emptyRange.id)).toBe(false);
  expect(groups.some((group) => group.id === unreadyRange.id)).toBe(false);
});
