import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { type Db, productRanges, productRangeVariants, products } from '@pkg/db';
import { productRangeSourceHash, productRangeVariantSourceHash, productSourceHash } from '@pkg/domain';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

import { createCatalogTranslationRunner } from './catalog-translation-runner.js';
import { TranslationScheduler } from './translation-scheduler.js';
import { generatedJson, ManualTimers, waitForModelCalls, waitForTurns } from './translation-test-utils.js';

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
  test('derives missing and stale counts for every catalog translation unit', async ({ context }) => {
    await insertTranslationMatrix(context.db);

    await expect(context.createCaller().productRanges.translationStatus()).resolves.toEqual({
      products: { missing: 1, stale: 1 },
      ranges: { missing: 1, stale: 1 },
      variants: { missing: 1, stale: 1 },
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

    await expect(caller.productRanges.retranslateStale()).resolves.toEqual({ queued: 6 });
    expect(context.model.doGenerateCalls).toHaveLength(0);

    context.timers.advance(60_000);
    await waitForModelCalls(context.model, 2);
    await expect(caller.productRanges.retranslateStale()).resolves.toEqual({ queued: 6 });
    releaseTranslations?.();
    await waitForHealthyStatus(caller);
    expect(context.model.doGenerateCalls).toHaveLength(6);

    await waitForTurns();
    context.timers.advance(60_000);
    await waitForTurns();
    expect(context.model.doGenerateCalls).toHaveLength(6);
    await expect(caller.productRanges.retranslateStale()).resolves.toEqual({ queued: 0 });
  });

  test('denies translation health and recovery to non-admin users', async ({ context }) => {
    const caller = context.createCaller(mockSession('procurement-manager'));

    await expect(caller.productRanges.translationStatus()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.productRanges.retranslateStale()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

async function insertTranslationMatrix(db: Db): Promise<void> {
  const parent = { description: 'Fresh parent range.', name: 'Parent Range' };
  const [parentRow] = await db
    .insert(productRanges)
    .values({
      ...parent,
      displayOrder: 0,
      translations: {
        af: {
          description: 'Vars ouerreeks.',
          name: 'Ouerreeks',
          sourceHash: productRangeSourceHash(parent),
          translatedAt: '2026-07-13T10:00:00.000Z',
        },
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
        af: {
          description: 'Ou reeks.',
          name: 'Ou Reeks',
          sourceHash: 'outdated',
          translatedAt: '2026-07-13T10:00:00.000Z',
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
        af: {
          name: 'Vars Variant',
          sourceHash: productRangeVariantSourceHash(freshVariant),
          translatedAt: '2026-07-13T10:00:00.000Z',
        },
      },
    },
    {
      displayOrder: 2,
      name: 'Stale Variant',
      rangeId: parentRow.id,
      translations: {
        af: { name: 'Ou Variant', sourceHash: 'outdated', translatedAt: '2026-07-13T10:00:00.000Z' },
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
        af: {
          category: null,
          description: 'Vars produk.',
          keyFeatures: [],
          name: 'Vars Produk',
          nameHighlight: null,
          sourceHash: productSourceHash(freshProduct, []),
          technicalDetails: [],
          translatedAt: '2026-07-13T10:00:00.000Z',
        },
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
        af: {
          category: null,
          description: 'Ou produk.',
          keyFeatures: [],
          name: 'Ou Produk',
          nameHighlight: null,
          sourceHash: 'outdated',
          technicalDetails: [],
          translatedAt: '2026-07-13T10:00:00.000Z',
        },
      },
    },
  ]);
}

async function waitForHealthyStatus(caller: AppRouterCaller): Promise<void> {
  const healthy = {
    products: { missing: 0, stale: 0 },
    ranges: { missing: 0, stale: 0 },
    variants: { missing: 0, stale: 0 },
  };
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (JSON.stringify(await caller.productRanges.translationStatus()) === JSON.stringify(healthy)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  expect(await caller.productRanges.translationStatus()).toEqual(healthy);
}
