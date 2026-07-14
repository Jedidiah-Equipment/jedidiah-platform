import { eq, productAssemblies, productRanges, productRangeVariants, products } from '@pkg/db';
import { catalogSourceHashes } from '@pkg/domain';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import {
  getCatalogTranslationStatus,
  listCatalogTranslationKeys,
  listCatalogTranslationKeysNeedingTranslation,
  loadCatalogTranslationSource,
  persistCatalogTranslation,
} from './catalog-translation-service.js';

const test = createTester();

describe('catalog translation persistence', () => {
  test('loads and persists one Product bundle atomically without replacing other locales', async ({ context }) => {
    const [range] = await context.db
      .insert(productRanges)
      .values({ displayOrder: 0, name: 'Trailers' })
      .returning({ id: productRanges.id });
    if (!range) throw new Error('Range fixture missing');

    const [product] = await context.db
      .insert(products)
      .values({
        basePrice: 1000,
        buildTimeDays: 14,
        category: 'Silage',
        description: 'Built for harvest.',
        keyFeatures: ['High capacity'],
        modelCode: 'ST-42',
        name: 'Silage Trailer',
        nameHighlight: 'XL',
        rangeId: range.id,
        technicalDetails: [{ label: 'Capacity', value: '42 m³' }],
        translations: {
          zu: {
            name: envelope('Inqola', 'older'),
          },
        },
      })
      .returning({ id: products.id });
    if (!product) throw new Error('Product fixture missing');

    const [assembly] = await context.db
      .insert(productAssemblies)
      .values({ displayOrder: 0, kind: 'standard', name: 'Hydraulic tailgate', productId: product.id })
      .returning({ id: productAssemblies.id });
    if (!assembly) throw new Error('Assembly fixture missing');

    const source = await loadCatalogTranslationSource({ db: context.db, key: `product:${product.id}` });
    expect(source).toMatchObject({
      kind: 'product',
      state: 'missing',
      canonical: {
        name: 'Silage Trailer',
        assemblies: [{ id: assembly.id, name: 'Hydraulic tailgate' }],
      },
    });
    if (source?.kind !== 'product') throw new Error('Product translation source missing');

    const translatedAt = new Date('2026-07-13T10:00:00.000Z');
    await persistCatalogTranslation({
      db: context.db,
      kind: 'product',
      source,
      translatedAt,
      translation: {
        name: 'Kuilvoer-sleepwa',
        nameHighlight: 'XL',
        category: 'Kuilvoer',
        description: 'Gebou vir die oes.',
        keyFeatures: ['Hoë kapasiteit'],
        technicalDetails: [{ label: 'Kapasiteit', value: '42 m³' }],
        assemblies: [{ id: assembly.id, name: 'Hidrouliese agterklap' }],
      },
    });

    const reread = await loadCatalogTranslationSource({ db: context.db, key: `product:${product.id}` });
    expect(reread).toMatchObject({ sourceHashes: source.sourceHashes, state: 'fresh' });

    const [productRow] = await context.db.select().from(products);
    const [assemblyRow] = await context.db.select().from(productAssemblies);
    expect(productRow?.translations.zu?.name?.value).toBe('Inqola');
    expect(productRow?.translations.af).toMatchObject({
      name: {
        isManual: false,
        sourceHash: source.sourceHashes.product.name,
        translatedAt: translatedAt.toISOString(),
        value: 'Kuilvoer-sleepwa',
      },
    });
    expect(assemblyRow?.translations.af).toEqual({
      name: {
        isManual: false,
        sourceHash: source.sourceHashes.assemblies[0]?.name,
        translatedAt: translatedAt.toISOString(),
        value: 'Hidrouliese agterklap',
      },
    });

    await context.db.update(products).set({ description: 'Updated harvest copy.' }).where(eq(products.id, product.id));
    const staleSource = await loadCatalogTranslationSource({ db: context.db, key: `product:${product.id}` });
    expect(staleSource).toMatchObject({ kind: 'product', state: 'stale' });
    if (staleSource?.kind !== 'product') throw new Error('Stale Product translation source missing');

    await persistCatalogTranslation({
      db: context.db,
      kind: 'product',
      source: staleSource,
      translatedAt: new Date('2026-07-13T11:00:00.000Z'),
      translation: {
        name: 'Reworded name that must not persist',
        nameHighlight: 'Reworded highlight',
        category: 'Reworded category',
        description: 'Bygewerkte oesteks.',
        keyFeatures: ['Reworded feature'],
        technicalDetails: [{ label: 'Reworded', value: 'detail' }],
        assemblies: [{ id: assembly.id, name: 'Reworded assembly' }],
      },
    });

    const [updatedProductRow] = await context.db.select().from(products);
    const [updatedAssemblyRow] = await context.db.select().from(productAssemblies);
    expect(updatedProductRow?.translations.af?.name?.value).toBe('Kuilvoer-sleepwa');
    expect(updatedProductRow?.translations.af?.description?.value).toBe('Bygewerkte oesteks.');
    expect(updatedAssemblyRow?.translations.af?.name?.value).toBe('Hidrouliese agterklap');
  });

  test('loads and persists Range and Variant translation units', async ({ context }) => {
    const [range] = await context.db
      .insert(productRanges)
      .values({ description: 'Harvest trailers.', displayOrder: 0, name: 'Trailers' })
      .returning({ id: productRanges.id });
    if (!range) throw new Error('Range fixture missing');
    const [variant] = await context.db
      .insert(productRangeVariants)
      .values({ displayOrder: 0, name: 'Heavy Duty', rangeId: range.id })
      .returning({ id: productRangeVariants.id });
    if (!variant) throw new Error('Variant fixture missing');

    const rangeSource = await loadCatalogTranslationSource({ db: context.db, key: `product_range:${range.id}` });
    const variantSource = await loadCatalogTranslationSource({
      db: context.db,
      key: `product_range_variant:${variant.id}`,
    });
    if (rangeSource?.kind !== 'range') throw new Error('Range translation source missing');
    if (variantSource?.kind !== 'variant') throw new Error('Variant translation source missing');

    await persistCatalogTranslation({
      db: context.db,
      kind: 'range',
      source: rangeSource,
      translatedAt: new Date('2026-07-13T10:00:00.000Z'),
      translation: { name: 'Sleepwaens', description: 'Oessleepwaens.' },
    });
    await persistCatalogTranslation({
      db: context.db,
      kind: 'variant',
      source: variantSource,
      translatedAt: new Date('2026-07-13T10:00:00.000Z'),
      translation: { name: 'Swaardiens' },
    });

    await expect(
      loadCatalogTranslationSource({ db: context.db, key: `product_range:${range.id}` }),
    ).resolves.toMatchObject({ state: 'fresh' });
    await expect(
      loadCatalogTranslationSource({ db: context.db, key: `product_range_variant:${variant.id}` }),
    ).resolves.toMatchObject({ state: 'fresh' });
  });

  test('does not overwrite a field made manual after the AI source was loaded', async ({ context }) => {
    const [range] = await context.db
      .insert(productRanges)
      .values({ description: 'Harvest trailers.', displayOrder: 0, name: 'Trailers' })
      .returning({ id: productRanges.id });
    if (!range) throw new Error('Range fixture missing');

    const source = await loadCatalogTranslationSource({ db: context.db, key: `product_range:${range.id}` });
    if (source?.kind !== 'range') throw new Error('Range translation source missing');

    await context.db
      .update(productRanges)
      .set({
        translations: {
          af: {
            name: {
              isManual: true,
              sourceHash: 'manual-lock',
              translatedAt: '2026-07-14T09:00:00.000Z',
              value: 'My handgeskrewe reeks',
            },
          },
        },
      })
      .where(eq(productRanges.id, range.id));

    await persistCatalogTranslation({
      db: context.db,
      kind: 'range',
      source,
      translatedAt: new Date('2026-07-14T10:00:00.000Z'),
      translation: { description: 'Oessleepwaens.', name: 'AI-reeks' },
    });

    const [row] = await context.db.select().from(productRanges).where(eq(productRanges.id, range.id));
    expect(row?.translations.af?.name).toMatchObject({ isManual: true, value: 'My handgeskrewe reeks' });
    expect(row?.translations.af?.description).toMatchObject({ isManual: false, value: 'Oessleepwaens.' });
  });

  test('reports manual source drift for review without adding it to the AI queue', async ({ context }) => {
    const canonical = { description: 'Harvest trailers.', name: 'Trailers' };
    const sourceHashes = catalogSourceHashes(canonical);
    const [range] = await context.db
      .insert(productRanges)
      .values({
        ...canonical,
        displayOrder: 0,
        translations: {
          af: {
            description: envelope('Oessleepwaens.', 'outdated', true),
            name: envelope('Sleepwaens', sourceHashes.name),
          },
        },
      })
      .returning({ id: productRanges.id });
    if (!range) throw new Error('Range fixture missing');

    await expect(getCatalogTranslationStatus({ db: context.db })).resolves.toEqual({
      products: { missing: 0, needsReview: 0, stale: 0 },
      ranges: { missing: 0, needsReview: 1, stale: 0 },
      variants: { missing: 0, needsReview: 0, stale: 0 },
    });
    await expect(listCatalogTranslationKeysNeedingTranslation({ db: context.db })).resolves.toEqual([]);
  });

  test('lists every active catalog translation unit for an idempotent sweep', async ({ context }) => {
    const [range] = await context.db
      .insert(productRanges)
      .values({ displayOrder: 0, name: 'Trailers' })
      .returning({ id: productRanges.id });
    if (!range) throw new Error('Range fixture missing');
    const [variant] = await context.db
      .insert(productRangeVariants)
      .values({ displayOrder: 0, name: 'Heavy Duty', rangeId: range.id })
      .returning({ id: productRangeVariants.id });
    if (!variant) throw new Error('Variant fixture missing');
    const [product] = await context.db
      .insert(products)
      .values({
        basePrice: 1000,
        buildTimeDays: 14,
        description: null,
        modelCode: 'ST-42',
        name: 'Silage Trailer',
        rangeId: range.id,
      })
      .returning({ id: products.id });
    if (!product) throw new Error('Product fixture missing');

    await expect(listCatalogTranslationKeys({ db: context.db })).resolves.toEqual([
      `product:${product.id}`,
      `product_range:${range.id}`,
      `product_range_variant:${variant.id}`,
    ]);
  });
});

function envelope<Value>(value: Value, sourceHash = 'hash', isManual = false) {
  return {
    isManual,
    sourceHash,
    translatedAt: '2026-01-01T00:00:00.000Z',
    value,
  };
}
