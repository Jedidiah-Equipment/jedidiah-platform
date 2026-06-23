import { productRanges, products } from '@pkg/db';
import { expect } from 'vitest';

import { test } from '../test/tester.js';
import { loadProductsCatalog, toRangeSlug } from './products-data.js';

async function insertRange(db: Parameters<typeof loadProductsCatalog>[0], name: string, description: string | null) {
  const [range] = await db.insert(productRanges).values({ name, description }).returning();
  if (!range) throw new Error('range insert did not return a row');

  return range;
}

async function insertProduct(
  db: Parameters<typeof loadProductsCatalog>[0],
  rangeId: string,
  values: { name: string; modelCode: string; description?: string | null },
) {
  const [product] = await db
    .insert(products)
    .values({ basePrice: 1000, buildTimeDays: 5, rangeId, ...values })
    .returning();
  if (!product) throw new Error('product insert did not return a row');

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

test('loadProductsCatalog renders a missing Product description as empty', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Recharge Range ${suffix}`, null);
  const product = await insertProduct(db, range.id, {
    name: `Recharge Tank ${suffix}`,
    modelCode: `RC-${suffix}`,
    description: null,
  });

  const { groups } = await loadProductsCatalog(db);
  const card = groups.find((group) => group.id === range.id)?.products.find((candidate) => candidate.id === product.id);

  expect(card?.description).toBe('');
});

test('loadProductsCatalog omits Ranges that have no Products', async ({ db }) => {
  const emptyRange = await insertRange(db, `Empty Range ${crypto.randomUUID()}`, 'No models yet.');

  const { groups } = await loadProductsCatalog(db);

  expect(groups.some((group) => group.id === emptyRange.id)).toBe(false);
});
