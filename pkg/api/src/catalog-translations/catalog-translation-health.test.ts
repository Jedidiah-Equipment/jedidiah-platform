import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { type Db, productAssemblies, productRanges, productRangeVariants, products } from '@pkg/db';
import { catalogSourceHashes } from '@pkg/domain';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

import { createCatalogTranslationRunner } from './catalog-translation-runner.js';
import { TranslationScheduler } from './translation-scheduler.js';
import {
  generatedJson,
  ManualTimers,
  translationEnvelopes,
  waitForModelCalls,
  waitForTurns,
} from './translation-test-utils.js';

type DoGenerate = (options: LanguageModelV3CallOptions) => PromiseLike<LanguageModelV3GenerateResult>;

const test = createTester(({ cleanup, db }) => {
  let generate: DoGenerate = async () => {
    throw new Error('Translation response not configured');
  };
  const model = new MockLanguageModelV3({ doGenerate: (options) => generate(options) });
  const timers = new ManualTimers();
  const catalogTranslationScheduler = new TranslationScheduler({
    clearTimer: (timer) => timers.clear(timer),
    run: createCatalogTranslationRunner({ db, model }),
    setTimer: (callback, delayMs) => timers.set(callback, delayMs),
  });
  cleanup(() => catalogTranslationScheduler.dispose());

  return {
    catalogTranslationScheduler,
    db,
    model,
    setGenerate(next: DoGenerate) {
      generate = next;
    },
    timers,
  };
});

describe('catalog translation health', () => {
  test('lists every catalog entity and field whose manual translation needs review', async ({ context }) => {
    const queue = await insertNeedsReviewQueue(context.db);

    await expect(context.createCaller().catalogTranslations.listNeedsReview()).resolves.toEqual([
      {
        affectedFields: [
          { field: 'description', kind: 'product' },
          { kind: 'assembly', name: 'Hydraulic tailgate' },
        ],
        id: queue.productId,
        kind: 'product',
        name: 'Silage Trailer',
      },
      {
        affectedFields: [{ field: 'description', kind: 'range' }],
        id: queue.rangeId,
        kind: 'range',
        name: 'Trailers',
      },
      {
        affectedFields: [{ field: 'name', kind: 'variant' }],
        id: queue.variantId,
        kind: 'variant',
        name: 'Heavy Duty',
        rangeId: queue.rangeId,
      },
    ]);

    await expect(context.createCaller().catalogTranslations.translationStatus()).resolves.toEqual({
      products: { missing: 1, needsReview: 1, stale: 0 },
      ranges: { missing: 1, needsReview: 1, stale: 0 },
      variants: { missing: 0, needsReview: 1, stale: 0 },
    });

    const caller = context.createCaller();
    await caller.catalogTranslations.updateProduct({
      assemblies: [
        {
          fields: { name: { isManual: true, value: 'Hidrouliese agterklap' } },
          id: queue.assemblyId,
        },
      ],
      fields: { description: { isManual: true, value: 'Gebou vir die oes.' } },
      id: queue.productId,
    });
    await caller.catalogTranslations.updateRange({
      fields: { description: { isManual: false } },
      id: queue.rangeId,
    });
    await caller.catalogTranslations.updateVariant({
      fields: { name: { isManual: true, value: 'Swaardiens' } },
      id: queue.variantId,
    });

    await expect(caller.catalogTranslations.listNeedsReview()).resolves.toEqual([]);
    await expect(caller.catalogTranslations.translationStatus()).resolves.toEqual({
      products: { missing: 1, needsReview: 0, stale: 0 },
      ranges: { missing: 1, needsReview: 0, stale: 0 },
      variants: { missing: 0, needsReview: 0, stale: 0 },
    });
  });

  test('derives missing, stale, and needs-review counts for every catalog translation unit', async ({ context }) => {
    await insertTranslationMatrix(context.db);

    await expect(context.createCaller().catalogTranslations.translationStatus()).resolves.toEqual({
      products: { missing: 1, needsReview: 0, stale: 1 },
      ranges: { missing: 1, needsReview: 1, stale: 1 },
      variants: { missing: 1, needsReview: 0, stale: 1 },
    });
  });

  test('coalesces repeated sweeps, heals the unhealthy set, and skips fresh units', async ({ context }) => {
    await insertTranslationMatrix(context.db);
    let releaseTranslations: (() => void) | undefined;
    const translationsCanFinish = new Promise<void>((resolve) => {
      releaseTranslations = resolve;
    });
    context.setGenerate(async ({ prompt }) => {
      await translationsCanFinish;
      const request = JSON.stringify(prompt);
      if (request.includes('assemblies')) {
        return generatedJson({
          assemblies: [],
          category: null,
          description: 'Vertaalde produk.',
          keyFeatures: [],
          name: 'Vertaalde Produk',
          nameHighlight: null,
          technicalDetails: [],
        });
      }
      if (request.includes('description')) {
        return generatedJson({ description: 'Vertaalde reeks.', name: 'Vertaalde Reeks' });
      }
      return generatedJson({ name: 'Vertaalde Variant' });
    });
    const caller = context.createCaller(undefined, {
      catalogTranslationScheduler: context.catalogTranslationScheduler,
    });

    await expect(caller.catalogTranslations.retranslateStale()).resolves.toEqual({ queued: 6 });
    expect(context.model.doGenerateCalls).toHaveLength(0);

    context.timers.advance(60_000);
    await waitForModelCalls(context.model, 2);
    await expect(caller.catalogTranslations.retranslateStale()).resolves.toEqual({ queued: 6 });
    releaseTranslations?.();
    await waitForHealthyStatus(caller);
    expect(context.model.doGenerateCalls).toHaveLength(6);

    await waitForTurns();
    context.timers.advance(60_000);
    await waitForTurns();
    expect(context.model.doGenerateCalls).toHaveLength(6);
    await expect(caller.catalogTranslations.retranslateStale()).resolves.toEqual({ queued: 0 });
  });

  test('denies translation health and recovery to non-admin users', async ({ context }) => {
    const caller = context.createCaller(mockSession('procurement-manager'));

    await expect(caller.catalogTranslations.translationStatus()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.catalogTranslations.retranslateStale()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

async function insertNeedsReviewQueue(db: Db) {
  const [range] = await db
    .insert(productRanges)
    .values({
      description: 'Harvest trailers.',
      displayOrder: 0,
      name: 'Trailers',
      translations: {
        af: {
          description: manualEnvelope('Oessleepwaens.'),
        },
      },
    })
    .returning({ id: productRanges.id });
  if (!range) throw new Error('Range fixture missing');

  const [variant] = await db
    .insert(productRangeVariants)
    .values({
      displayOrder: 0,
      name: 'Heavy Duty',
      rangeId: range.id,
      translations: { af: { name: manualEnvelope('Swaardiens') } },
    })
    .returning({ id: productRangeVariants.id });
  if (!variant) throw new Error('Variant fixture missing');

  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      description: 'Built for harvest.',
      modelCode: 'ST-42',
      name: 'Silage Trailer',
      rangeId: range.id,
      translations: { af: { description: manualEnvelope('Gebou vir die oes.') } },
    })
    .returning({ id: products.id });
  if (!product) throw new Error('Product fixture missing');

  const [assembly] = await db
    .insert(productAssemblies)
    .values({
      displayOrder: 0,
      kind: 'standard',
      name: 'Hydraulic tailgate',
      productId: product.id,
      translations: { af: { name: manualEnvelope('Hidrouliese agterklap') } },
    })
    .returning({ id: productAssemblies.id });
  if (!assembly) throw new Error('Assembly fixture missing');

  return { assemblyId: assembly.id, productId: product.id, rangeId: range.id, variantId: variant.id };
}

function manualEnvelope(value: string) {
  return {
    isManual: true,
    sourceHash: 'outdated',
    translatedAt: '2026-07-14T09:00:00.000Z',
    value,
  };
}

async function insertTranslationMatrix(db: Db): Promise<void> {
  const parent = { description: 'Fresh parent range.', name: 'Parent Range' };
  const [parentRow] = await db
    .insert(productRanges)
    .values({
      ...parent,
      displayOrder: 0,
      translations: {
        af: translationEnvelopes(parent, { description: 'Vars ouerreeks.', name: 'Ouerreeks' }),
      },
    })
    .returning({ id: productRanges.id });
  if (!parentRow) throw new Error('Parent Range fixture missing');

  await db.insert(productRanges).values([
    { description: 'Missing range.', displayOrder: 1, name: 'Missing Range' },
    {
      description: 'Stale range.',
      displayOrder: 2,
      name: 'Stale Range',
      translations: {
        af: translationEnvelopes(
          { description: 'Stale range.', name: 'Stale Range' },
          { description: 'Ou reeks.', name: 'Ou Reeks' },
          'outdated',
        ),
      },
    },
    {
      description: 'Manually translated range.',
      displayOrder: 3,
      name: 'Manual Range',
      translations: {
        af: {
          description: {
            isManual: true,
            sourceHash: 'outdated',
            translatedAt: '2026-07-14T09:00:00.000Z',
            value: 'Handvertaalde reeks.',
          },
          name: {
            isManual: false,
            sourceHash: catalogSourceHashes({ name: 'Manual Range' }).name,
            translatedAt: '2026-07-14T09:00:00.000Z',
            value: 'Handreeks',
          },
        },
      },
    },
  ]);

  const freshVariant = { name: 'Fresh Variant' };
  await db.insert(productRangeVariants).values([
    { displayOrder: 0, name: 'Missing Variant', rangeId: parentRow.id },
    {
      displayOrder: 1,
      name: freshVariant.name,
      rangeId: parentRow.id,
      translations: {
        af: translationEnvelopes(freshVariant, { name: 'Vars Variant' }),
      },
    },
    {
      displayOrder: 2,
      name: 'Stale Variant',
      rangeId: parentRow.id,
      translations: {
        af: translationEnvelopes({ name: 'Stale Variant' }, { name: 'Ou Variant' }, 'outdated'),
      },
    },
  ]);

  const freshProduct = {
    category: null,
    description: 'Fresh product.',
    keyFeatures: [] as string[],
    name: 'Fresh Product',
    nameHighlight: null,
    technicalDetails: [] as Array<{ label: string; value: string }>,
  };
  await db.insert(products).values([
    {
      basePrice: 1_000,
      buildTimeDays: 14,
      description: 'Missing product.',
      modelCode: 'MISSING-1',
      name: 'Missing Product',
      rangeId: parentRow.id,
    },
    {
      basePrice: 1_000,
      buildTimeDays: 14,
      description: freshProduct.description,
      modelCode: 'FRESH-1',
      name: freshProduct.name,
      rangeId: parentRow.id,
      translations: {
        af: translationEnvelopes(freshProduct, {
          category: null,
          description: 'Vars produk.',
          keyFeatures: [],
          name: 'Vars Produk',
          nameHighlight: null,
          technicalDetails: [],
        }),
      },
    },
    {
      basePrice: 1_000,
      buildTimeDays: 14,
      description: 'Stale product.',
      modelCode: 'STALE-1',
      name: 'Stale Product',
      rangeId: parentRow.id,
      translations: {
        af: translationEnvelopes(
          {
            category: null,
            description: 'Stale product.',
            keyFeatures: [] as string[],
            name: 'Stale Product',
            nameHighlight: null,
            technicalDetails: [] as Array<{ label: string; value: string }>,
          },
          {
            category: null,
            description: 'Ou produk.',
            keyFeatures: [],
            name: 'Ou Produk',
            nameHighlight: null,
            technicalDetails: [],
          },
          'outdated',
        ),
      },
    },
  ]);
}

async function waitForHealthyStatus(caller: AppRouterCaller): Promise<void> {
  const healthy = {
    products: { missing: 0, needsReview: 0, stale: 0 },
    ranges: { missing: 0, needsReview: 1, stale: 0 },
    variants: { missing: 0, needsReview: 0, stale: 0 },
  };
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (JSON.stringify(await caller.catalogTranslations.translationStatus()) === JSON.stringify(healthy)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  expect(await caller.catalogTranslations.translationStatus()).toEqual(healthy);
}
