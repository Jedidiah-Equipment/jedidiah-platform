import { createUserAccessSummary } from '@pkg/domain';
import type { Product } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { z } from 'zod';

import { getProductTool } from '@/routes/ai/tools/get-product.js';
import { createActorUser, createAiContext, createModelCode } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('getProductTool', () => {
  test('returns the same product result shape as products.get', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Compact Loader');
    const access = createUserAccessSummary({
      role: 'product-editor',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getProductTool.handler({ id: created.id }, createAiContext(context.db, access)),
      caller.products.get({ id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('surfaces the core not-found message for missing products', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'product-editor',
      userId: 'test-user-id',
    });

    await expect(
      getProductTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Product not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid product get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'product-editor',
      userId: 'test-user-id',
    });

    await expect(getProductTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});

async function createProduct(caller: AppRouterCaller, name: string): Promise<Product> {
  return caller.products.create({
    basePrice: 1_000,
    description: null,
    leadTimeDays: 14,
    modelCode: createModelCode(name),
    name,
  });
}
