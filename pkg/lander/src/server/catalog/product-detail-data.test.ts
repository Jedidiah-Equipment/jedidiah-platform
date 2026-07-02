import { productAssemblies, productRanges, products } from '@pkg/db';
import { expect } from 'vitest';
import { test } from '../../test/tester.js';
import { transformSignature } from '../media/image-transform.js';
import { loadProductDetail } from './product-detail-data.js';

type Db = Parameters<typeof loadProductDetail>[0];

async function insertRange(db: Db, name: string) {
  const existing = await db.select({ id: productRanges.id }).from(productRanges);
  const [range] = await db
    .insert(productRanges)
    .values({ name, description: null, displayOrder: existing.length })
    .returning();
  if (!range) throw new Error('range insert did not return a row');

  return range;
}

type ProductImageRef = { byteSize: number; contentType: string; storageKey: string; updatedAt: string };

function imageRef(slot: string): ProductImageRef {
  return {
    byteSize: 1024,
    contentType: 'image/png',
    storageKey: `products/${slot}-${crypto.randomUUID()}.png`,
    updatedAt: new Date().toISOString(),
  };
}

// The lander gallery slots (primary + both secondaries) the lander-completeness gate requires.
function landerGalleryImages(): Record<string, ProductImageRef> {
  return { primary: imageRef('primary'), secondary1: imageRef('secondary1'), secondary2: imageRef('secondary2') };
}

// Every Product image slot — both the lander gallery and the brochure-only slots — so a Product is image-ready
// for both surfaces.
function allSlotImages(): Record<string, ProductImageRef> {
  return {
    ...landerGalleryImages(),
    technicalDrawing: imageRef('technicalDrawing'),
    banner: imageRef('banner'),
  };
}

// Inserts a Product that is lander field-ready by default (landerEnabled, category, key feature, description,
// and the gallery images all present), so adding one standard assembly makes it lander-ready. Tests override
// fields to break readiness or to add the brochure-only requirements.
async function insertProduct(
  db: Db,
  rangeId: string,
  values: {
    name: string;
    modelCode: string;
    description?: string | null;
    category?: string | null;
    keyFeatures?: string[];
    technicalDetails?: { label: string; value: string }[];
    images?: Partial<Record<string, ProductImageRef>>;
    brochureEnabled?: boolean;
    landerEnabled?: boolean;
  },
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
      images: landerGalleryImages(),
      ...values,
    })
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
    category: 'Built for high-volume haulage.',
    keyFeatures: ['Heavy-duty monocoque body', 'Twin-ram hydraulic tipping'],
    technicalDetails: [
      { label: 'Capacity', value: '14 t' },
      { label: 'Body', value: 'Monocoque' },
    ],
  });
  await insertAssembly(db, product.id, { kind: 'standard', name: 'Sprung drawbar', displayOrder: 0 });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail).not.toBeNull();
  expect(detail?.id).toBe(product.id);
  expect(detail?.name).toBe(product.name);
  expect(detail?.modelCode).toBe(product.modelCode);
  expect(detail?.rangeName).toBe(range.name);
  expect(detail?.rangeSlug).toBe(`crosshaul-${suffix}-range`);
  expect(detail?.tagline).toBe('Built for high-volume haulage.');
  expect(detail?.description).toBe('Flagship 14-ton tipping trailer.');
  // Each image URL carries its slot's `updatedAt` plus the transform signature as a `?v=` cache-busting
  // token (issue #647).
  const primaryV = `${Date.parse(product.images.primary?.updatedAt ?? '')}-${transformSignature('webp')}`;
  const secondary1V = `${Date.parse(product.images.secondary1?.updatedAt ?? '')}-${transformSignature('webp')}`;
  const secondary2V = `${Date.parse(product.images.secondary2?.updatedAt ?? '')}-${transformSignature('webp')}`;
  expect(detail?.imageUrl).toBe(`/images/products/${product.id}?v=${primaryV}`);
  // The og:image variant is JPEG: social scrapers refuse to render WebP preview images.
  const primaryOgV = `${Date.parse(product.images.primary?.updatedAt ?? '')}-${transformSignature('jpeg')}`;
  expect(detail?.ogImageUrl).toBe(`/images/products/${product.id}?format=jpeg&v=${primaryOgV}`);
  expect(detail?.galleryImages).toEqual([
    { slot: 'primary', imageUrl: `/images/products/${product.id}?v=${primaryV}` },
    { slot: 'secondary1', imageUrl: `/images/products/${product.id}?slot=secondary1&v=${secondary1V}` },
    { slot: 'secondary2', imageUrl: `/images/products/${product.id}?slot=secondary2&v=${secondary2V}` },
  ]);
  expect(detail?.keyFeatures).toEqual(['Heavy-duty monocoque body', 'Twin-ram hydraulic tipping']);
  expect(detail?.highlights).toEqual([
    { value: '14 t', label: 'Capacity' },
    { value: 'Monocoque', label: 'Body' },
  ]);
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
  await insertAssembly(db, product.id, { kind: 'standard', name: 'Tank frame', displayOrder: 0 });
  const sibling = await insertProduct(db, range.id, {
    name: `RC3000 ${suffix}`,
    modelCode: `RC3000-${suffix}`,
    description: 'Compact field bowser.',
  });
  await insertAssembly(db, sibling.id, { kind: 'standard', name: 'Tank frame', displayOrder: 0 });
  await insertProduct(db, otherRange.id, { name: `HD2020 ${suffix}`, modelCode: `HD2020-${suffix}` });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail?.related).toEqual([
    {
      id: sibling.id,
      name: sibling.name,
      modelCode: sibling.modelCode,
      description: 'Compact field bowser.',
      href: `/products/${encodeURIComponent(sibling.modelCode)}`,
      imageUrl: `/images/products/${sibling.id}?v=${Date.parse(sibling.images.primary?.updatedAt ?? '')}-${transformSignature('webp')}`,
    },
  ]);
});

test('loadProductDetail returns null when a required lander field is missing', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Silage ${suffix} Range`);
  // Field-ready by default, but with no description/category and no standard assembly the lander gate fails,
  // so the detail page 404s rather than rendering a half-empty page.
  const product = await insertProduct(db, range.id, {
    name: `ST300 Strip Till ${suffix}`,
    modelCode: `ST300-${suffix}`,
    description: null,
    category: null,
  });

  expect(await loadProductDetail(db, product.modelCode)).toBeNull();
});

test('loadProductDetail returns null when the lander publish toggle is off', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Silage ${suffix} Range`);
  const product = await insertProduct(db, range.id, {
    name: `ST400 Strip Till ${suffix}`,
    modelCode: `ST400-${suffix}`,
    landerEnabled: false,
  });
  await insertAssembly(db, product.id, { kind: 'standard', name: 'Frame', displayOrder: 0 });

  expect(await loadProductDetail(db, product.modelCode)).toBeNull();
});

test('loadProductDetail excludes not-lander-ready siblings from the related strip', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Recharge ${suffix} Range`);
  const product = await insertProduct(db, range.id, { name: `RC9000 ${suffix}`, modelCode: `RC9000-${suffix}` });
  await insertAssembly(db, product.id, { kind: 'standard', name: 'Tank frame', displayOrder: 0 });
  // A sibling with the publish toggle off must not appear in the related strip (it 404s on its own page).
  await insertProduct(db, range.id, {
    name: `RC3000 ${suffix}`,
    modelCode: `RC3000-${suffix}`,
    landerEnabled: false,
  });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail?.related).toEqual([]);
});

test('loadProductDetail exposes the brochure download link only when the brochure is ready', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Crosshaul ${suffix} Range`);
  // Brochure ready = enabled + every brochure slot present; the all-slot images also keep the lander ready so
  // the page resolves and can carry the link.
  const product = await insertProduct(db, range.id, {
    name: `CH14 Tipping Trailer ${suffix}`,
    modelCode: `CH14-${suffix}`,
    description: 'Flagship 14-ton tipping trailer.',
    category: 'Built for high-volume haulage.',
    keyFeatures: ['Heavy-duty monocoque body'],
    images: allSlotImages(),
    brochureEnabled: true,
  });
  await insertAssembly(db, product.id, { kind: 'standard', name: 'Sprung drawbar', displayOrder: 0 });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail?.brochureHref).toBe(`/downloads/products/${product.id}/brochure`);
});

test('loadProductDetail hides the brochure link when the brochure is not ready', async ({ db }) => {
  const suffix = crypto.randomUUID();
  const range = await insertRange(db, `Crosshaul ${suffix} Range`);
  // Lander-ready (gallery images + standard assembly) but the brochure is unpublished and missing its
  // brochure-only slots, so the link hides while the page itself still renders.
  const product = await insertProduct(db, range.id, {
    name: `CH12 Tipping Trailer ${suffix}`,
    modelCode: `CH12-${suffix}`,
    description: 'Compact tipping trailer.',
    category: 'Built for the mixed farm.',
    keyFeatures: ['Twin-ram hydraulic tipping'],
  });
  await insertAssembly(db, product.id, { kind: 'standard', name: 'Sprung drawbar', displayOrder: 0 });

  const detail = await loadProductDetail(db, product.modelCode);

  expect(detail).not.toBeNull();
  expect(detail?.brochureHref).toBeNull();
});
