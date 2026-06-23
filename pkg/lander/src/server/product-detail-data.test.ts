import { productAssemblies, productRanges, products } from '@pkg/db';
import { expect } from 'vitest';

import { test } from '../test/tester.js';
import { HIGHLIGHT_PLACEHOLDERS, loadProductDetail } from './product-detail-data.js';

type Db = Parameters<typeof loadProductDetail>[0];

async function insertRange(db: Db, name: string) {
  const [range] = await db.insert(productRanges).values({ name, description: null }).returning();
  if (!range) throw new Error('range insert did not return a row');

  return range;
}

async function insertProduct(
  db: Db,
  rangeId: string,
  values: {
    name: string;
    modelCode: string;
    description?: string | null;
    brochureSubtitle?: string | null;
    brochureKeyFeatures?: string[];
  },
) {
  const [product] = await db
    .insert(products)
    .values({ basePrice: 1000, buildTimeDays: 5, rangeId, ...values })
    .returning();
  if (!product) throw new Error('product insert did not return a row');

  return product;
}

async function insertAssembly(
  db: Db,
  productId: string,
  values: { kind: 'standard' | 'optional'; name: string; displayOrder: number },
) {
  await db.insert(productAssemblies).values({ productId, price: values.kind === 'optional' ? 100 : null, ...values });
}

test('loadProductDetail resolves a Product by model code with its Range and brochure copy', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Crosshaul ${suffix} Range`);
  const product = await insertProduct(db, range.id, {
    name: `CH14 Tipping Trailer ${suffix}`,
    modelCode: `CH14-${suffix}`,
    description: 'Flagship 14-ton tipping trailer.',
    brochureSubtitle: 'Built for high-volume haulage.',
    brochureKeyFeatures: ['Heavy-duty monocoque body', 'Twin-ram hydraulic tipping'],
  });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail).not.toBeNull();
  expect(detail?.id).toBe(product.id);
  expect(detail?.name).toBe(product.name);
  expect(detail?.modelCode).toBe(product.modelCode);
  expect(detail?.rangeName).toBe(range.name);
  expect(detail?.rangeSlug).toBe(`crosshaul-${suffix}-range`);
  expect(detail?.tagline).toBe('Built for high-volume haulage.');
  expect(detail?.description).toBe('Flagship 14-ton tipping trailer.');
  expect(detail?.imageUrl).toBe(`/images/products/${product.id}`);
  expect(detail?.keyFeatures).toEqual(['Heavy-duty monocoque body', 'Twin-ram hydraulic tipping']);
  expect(detail?.highlights).toEqual(HIGHLIGHT_PLACEHOLDERS);
});

test('loadProductDetail returns null for an unknown model code', async ({ db }) => {
  const detail = await loadProductDetail(db, `missing-${crypto.randomUUID()}`);

  expect(detail).toBeNull();
});

test('loadProductDetail splits assemblies by kind in display order', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Crosshaul ${suffix} Range`);
  const product = await insertProduct(db, range.id, {
    name: `CH12 Tipping Trailer ${suffix}`,
    modelCode: `CH12-${suffix}`,
  });
  await insertAssembly(db, product.id, { kind: 'standard', name: 'Sprung drawbar', displayOrder: 1 });
  await insertAssembly(db, product.id, { kind: 'standard', name: 'Bugle eye hitch', displayOrder: 0 });
  await insertAssembly(db, product.id, { kind: 'optional', name: 'Air brakes', displayOrder: 0 });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail?.standardAssemblies).toEqual(['Bugle eye hitch', 'Sprung drawbar']);
  expect(detail?.optionalAssemblies).toEqual(['Air brakes']);
});

test('loadProductDetail lists other Products in the same Range as related cards', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Recharge ${suffix} Range`);
  const otherRange = await insertRange(db, `Planting ${suffix} Range`);
  const product = await insertProduct(db, range.id, { name: `RC6000 ${suffix}`, modelCode: `RC6000-${suffix}` });
  const sibling = await insertProduct(db, range.id, {
    name: `RC3000 ${suffix}`,
    modelCode: `RC3000-${suffix}`,
    description: 'Compact field bowser.',
  });
  await insertProduct(db, otherRange.id, { name: `HD2020 ${suffix}`, modelCode: `HD2020-${suffix}` });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail?.related).toEqual([
    {
      id: sibling.id,
      name: sibling.name,
      modelCode: sibling.modelCode,
      description: 'Compact field bowser.',
      href: `/products/${encodeURIComponent(sibling.modelCode)}`,
      imageUrl: `/images/products/${sibling.id}`,
    },
  ]);
});

test('loadProductDetail renders missing brochure copy as empty', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Silage ${suffix} Range`);
  const product = await insertProduct(db, range.id, {
    name: `ST300 Strip Till ${suffix}`,
    modelCode: `ST300-${suffix}`,
    description: null,
    brochureSubtitle: null,
  });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail?.tagline).toBe('');
  expect(detail?.description).toBe('');
  expect(detail?.keyFeatures).toEqual([]);
  expect(detail?.standardAssemblies).toEqual([]);
  expect(detail?.optionalAssemblies).toEqual([]);
  expect(detail?.related).toEqual([]);
});
