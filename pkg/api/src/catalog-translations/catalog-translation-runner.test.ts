import { eq, productAssemblies, productRanges, products } from '@pkg/db';
import { catalogSourceHashes } from '@pkg/domain';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, vi } from 'vitest';

import { createTester } from '@/test/create-tester.js';

import { runCatalogTranslationBackfill } from './catalog-translation-backfill.js';
import { createCatalogTranslationRunner } from './catalog-translation-runner.js';
import { generatedJson } from './translation-test-utils.js';

const test = createTester(async ({ db }) => {
  const [range] = await db
    .insert(productRanges)
    .values({ description: 'Harvest equipment.', displayOrder: 0, name: 'Trailers' })
    .returning({ id: productRanges.id });
  if (!range) throw new Error('Range fixture missing');
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      description: 'Built for harvest.',
      keyFeatures: ['High capacity'],
      modelCode: 'ST-42',
      name: 'Silage Trailer',
      rangeId: range.id,
    })
    .returning({ id: products.id });
  if (!product) throw new Error('Product fixture missing');
  const [assembly] = await db
    .insert(productAssemblies)
    .values({ displayOrder: 0, kind: 'standard', name: 'Hydraulic tailgate', productId: product.id })
    .returning({ id: productAssemblies.id });
  if (!assembly) throw new Error('Assembly fixture missing');

  return { assemblyId: assembly.id, db, productId: product.id, rangeId: range.id };
});

describe('catalog translation runner', () => {
  test('translates a stale Product once and skips it when its source hash matches', async ({ context }) => {
    const model = new MockLanguageModelV3({
      doGenerate: async () =>
        generatedJson({
          name: 'Kuilvoer-sleepwa',
          nameHighlight: null,
          category: null,
          description: 'Gebou vir die oes.',
          keyFeatures: ['Hoë kapasiteit'],
          technicalDetails: [],
          assemblies: [{ id: context.assemblyId, name: 'Hidrouliese agterklap' }],
        }),
    });
    const run = createCatalogTranslationRunner({
      db: context.db,
      model,
      now: () => new Date('2026-07-13T10:00:00.000Z'),
    });

    await expect(run(`product:${context.productId}`)).resolves.toBe('translated');
    await expect(run(`product:${context.productId}`)).resolves.toBe('skipped');
    expect(model.doGenerateCalls).toHaveLength(1);

    const [product] = await context.db.select().from(products);
    const [assembly] = await context.db.select().from(productAssemblies);
    expect(product?.translations.af?.name?.value).toBe('Kuilvoer-sleepwa');
    expect(product?.translations.af?.name?.isManual).toBe(false);
    expect(assembly?.translations.af?.name?.value).toBe('Hidrouliese agterklap');
    expect(assembly?.translations.af?.name?.isManual).toBe(false);
  });

  test('does not call the model for a manual field that needs review', async ({ context }) => {
    const canonical = { description: 'Harvest equipment.', name: 'Trailers' };
    const sourceHashes = catalogSourceHashes(canonical);
    await context.db
      .update(productRanges)
      .set({
        translations: {
          af: {
            description: {
              isManual: true,
              sourceHash: 'outdated',
              translatedAt: '2026-07-14T09:00:00.000Z',
              value: 'Handmatige oestoerusting.',
            },
            name: {
              isManual: false,
              sourceHash: sourceHashes.name,
              translatedAt: '2026-07-14T09:00:00.000Z',
              value: 'Sleepwaens',
            },
          },
        },
      })
      .where(eq(productRanges.id, context.rangeId));
    const model = new MockLanguageModelV3({
      doGenerate: async () => generatedJson({ description: 'AI-inhoud.', name: 'AI-reeks' }),
    });
    const run = createCatalogTranslationRunner({ db: context.db, model });

    await expect(run(`product_range:${context.rangeId}`)).resolves.toBe('skipped');
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test('backfill translates the stale set and excludes healthy entities from later sweeps', async ({ context }) => {
    const model = new MockLanguageModelV3({
      doGenerate: async ({ prompt }) => {
        const request = JSON.stringify(prompt);
        return request.includes('assemblies')
          ? generatedJson({
              name: 'Kuilvoer-sleepwa',
              nameHighlight: null,
              category: null,
              description: 'Gebou vir die oes.',
              keyFeatures: ['Hoë kapasiteit'],
              technicalDetails: [],
              assemblies: [{ id: context.assemblyId, name: 'Hidrouliese agterklap' }],
            })
          : generatedJson({ name: 'Sleepwaens', description: 'Oestoerusting.' });
      },
    });
    const run = createCatalogTranslationRunner({ db: context.db, model });
    const onProgress = vi.fn();

    await expect(runCatalogTranslationBackfill({ db: context.db, onProgress, run })).resolves.toEqual({
      failed: 0,
      skipped: 0,
      translated: 2,
    });
    await expect(runCatalogTranslationBackfill({ db: context.db, run })).resolves.toEqual({
      failed: 0,
      skipped: 0,
      translated: 0,
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  test('backfill caps concurrency and counts failures without stopping the sweep', async ({ context }) => {
    let active = 0;
    let peak = 0;
    const run = vi.fn(
      async (key: `product:${string}` | `product_range:${string}` | `product_range_variant:${string}`) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (key.startsWith('product_range:')) throw new Error('model unavailable');
        return 'translated' as const;
      },
    );

    await expect(runCatalogTranslationBackfill({ concurrency: 1, db: context.db, run })).resolves.toEqual({
      failed: 1,
      skipped: 0,
      translated: 1,
    });
    expect(peak).toBe(1);
  });
});
