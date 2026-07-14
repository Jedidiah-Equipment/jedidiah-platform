import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { type Db, eq, productRanges, productRangeVariants, products, user } from '@pkg/db';
import type { Product } from '@pkg/schema';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';

import { createCatalogTranslationRunner } from './catalog-translation-runner.js';
import { TranslationScheduler } from './translation-scheduler.js';
import { generatedJson, ManualTimers, waitForModelCalls, waitForTurns } from './translation-test-utils.js';

type DoGenerate = (options: LanguageModelV3CallOptions) => PromiseLike<LanguageModelV3GenerateResult>;

const test = createTester(async ({ cleanup, db }) => {
  await createActorUser(db);
  const rangeId = await createProductRangeFixture(db);
  let generate: DoGenerate = async () => {
    throw new Error('Translation response not configured');
  };
  const model = new MockLanguageModelV3({ doGenerate: (options) => generate(options) });
  const run = createCatalogTranslationRunner({ db, model });
  const timers = new ManualTimers();
  const catalogTranslationScheduler = new TranslationScheduler({
    clearTimer: (timer) => timers.clear(timer),
    run,
    setTimer: (callback, delayMs) => timers.set(callback, delayMs),
  });
  cleanup(() => catalogTranslationScheduler.dispose());

  return {
    catalogTranslationScheduler,
    db,
    model,
    rangeId,
    setGenerate(next: DoGenerate) {
      generate = next;
    },
    timers,
  };
});

describe('catalog mutation translation triggers', () => {
  test('coalesces rapid Product saves and skips a later price-only save', async ({ context }) => {
    context.setGenerate(async () =>
      generatedJson({
        name: 'Kuilvoer-sleepwa',
        nameHighlight: null,
        category: null,
        description: 'Jongste beskrywing.',
        keyFeatures: [],
        technicalDetails: [],
        assemblies: [],
      }),
    );
    const caller = context.createCaller(undefined, {
      catalogTranslationScheduler: context.catalogTranslationScheduler,
    });
    const created = await createProduct(caller, context.rangeId);

    const firstSave = await caller.products.update(productUpdate(created, { description: 'First edit.' }));
    const settled = await caller.products.update(productUpdate(firstSave, { description: 'Latest description.' }));
    context.timers.advance(59_999);
    expect(context.model.doGenerateCalls).toHaveLength(0);

    context.timers.advance(1);
    await waitForModelCalls(context.model, 1);
    expect(context.model.doGenerateCalls).toHaveLength(1);
    expect(JSON.stringify(context.model.doGenerateCalls[0]?.prompt)).toContain('Latest description.');

    const [translated] = await context.db.select().from(products).where(eq(products.id, created.id));
    expect(translated?.translations.af).toMatchObject({
      description: 'Jongste beskrywing.',
      sourceHash: expect.any(String),
    });

    await caller.products.update(productUpdate(settled, { basePrice: settled.basePrice + 500 }));
    context.timers.advance(60_000);
    await waitForTurns();
    expect(context.model.doGenerateCalls).toHaveLength(1);
  });

  test('marks Range and Variant mutations for their own translation units', async ({ context }) => {
    context.setGenerate(async ({ prompt }) => {
      const request = JSON.stringify(prompt);
      return generatedJson(
        request.includes('description')
          ? { name: 'Sleepwaens', description: 'Oestoerusting.' }
          : { name: 'Swaardiens' },
      );
    });
    const caller = context.createCaller(undefined, {
      catalogTranslationScheduler: context.catalogTranslationScheduler,
    });
    const range = await caller.productRanges.create({ name: 'Harvest Trailers', description: 'Harvest equipment.' });
    const variant = await caller.productRanges.createVariant({ rangeId: range.id, name: 'Heavy Duty' });

    context.timers.advance(60_000);
    await waitForModelCalls(context.model, 2);
    await waitForTurns();

    const [rangeRow] = await context.db.select().from(productRanges).where(eq(productRanges.id, range.id));
    const [variantRow] = await context.db
      .select()
      .from(productRangeVariants)
      .where(eq(productRangeVariants.id, variant.id));
    expect(rangeRow?.translations.af?.name).toBe('Sleepwaens');
    expect(variantRow?.translations.af?.name).toBe('Swaardiens');
  });

  test('runs once more with the latest Product content when an edit lands mid-translation', async ({ context }) => {
    let finishFirst: ((result: LanguageModelV3GenerateResult) => void) | undefined;
    const firstResponse = new Promise<LanguageModelV3GenerateResult>((resolve) => {
      finishFirst = resolve;
    });
    let call = 0;
    context.setGenerate(async () => {
      call += 1;
      if (call === 1) return firstResponse;
      return generatedJson(productTranslation('Jongste inhoud.'));
    });
    const caller = context.createCaller(undefined, {
      catalogTranslationScheduler: context.catalogTranslationScheduler,
    });
    const created = await createProduct(caller, context.rangeId);

    context.timers.advance(60_000);
    await waitForModelCalls(context.model, 1);
    await caller.products.update(productUpdate(created, { description: 'Latest content.' }));

    finishFirst?.(generatedJson(productTranslation('Ou inhoud.')));
    await firstResponse;
    await waitForTurns();

    const [afterStaleResponse] = await context.db.select().from(products).where(eq(products.id, created.id));
    expect(afterStaleResponse?.translations.af).toBeUndefined();

    context.timers.advance(60_000);
    await waitForModelCalls(context.model, 2);
    await waitForTurns();
    expect(JSON.stringify(context.model.doGenerateCalls[1]?.prompt)).toContain('Latest content.');

    const [translated] = await context.db.select().from(products).where(eq(products.id, created.id));
    expect(translated?.translations.af?.description).toBe('Jongste inhoud.');
  });

  test('leaves a failed Product stale and accepts a later retry', async ({ context }) => {
    context.setGenerate(async () => {
      throw new Error('model unavailable');
    });
    const caller = context.createCaller(undefined, {
      catalogTranslationScheduler: context.catalogTranslationScheduler,
    });
    const created = await createProduct(caller, context.rangeId);

    context.timers.advance(60_000);
    await waitForModelCalls(context.model, 1);
    await waitForTurns();
    const [stale] = await context.db.select().from(products).where(eq(products.id, created.id));
    expect(stale?.translations.af).toBeUndefined();

    context.setGenerate(async () => generatedJson(productTranslation('Herstel.')));
    await caller.products.update(productUpdate(created, { description: 'Retry content.' }));
    context.timers.advance(60_000);
    await waitForModelCalls(context.model, 2);
    await waitForTurns();

    const [translated] = await context.db.select().from(products).where(eq(products.id, created.id));
    expect(translated?.translations.af?.description).toBe('Herstel.');
  });
});

async function createProduct(caller: AppRouterCaller, rangeId: string): Promise<Product> {
  return caller.products.create({
    basePrice: 1_000,
    buildTimeDays: 14,
    description: 'Original description.',
    modelCode: 'ST-42',
    name: 'Silage Trailer',
    rangeId,
  });
}

function productUpdate(
  product: Product,
  overrides: Partial<Parameters<AppRouterCaller['products']['update']>[0]> = {},
) {
  return {
    basePrice: product.basePrice,
    brochureEnabled: product.brochureEnabled,
    buildTimeDays: product.buildTimeDays,
    currencyCode: product.currencyCode,
    description: product.description,
    id: product.id,
    landerEnabled: product.landerEnabled,
    modelCode: product.modelCode,
    name: product.name,
    rangeId: product.rangeId,
    requiresVinNumber: product.requiresVinNumber,
    thumbnailDataUrl: product.thumbnailDataUrl,
    ...overrides,
  };
}

function productTranslation(description: string) {
  return {
    name: 'Kuilvoer-sleepwa',
    nameHighlight: null,
    category: null,
    description,
    keyFeatures: [],
    technicalDetails: [],
    assemblies: [],
  };
}

async function createActorUser(db: Db): Promise<void> {
  await db
    .insert(user)
    .values({
      id: 'test-user-id',
      email: 'actor@example.com',
      emailVerified: true,
      name: 'Actor',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}
