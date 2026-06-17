import { type Db, products } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';

import { getQuoteTool } from '@/routes/ai/tools/get-quote.js';
import { createActorUser, createAiContext } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'sales');
  const product = await createProduct(db);

  return { db, product };
});

describe('getQuoteTool', () => {
  test('returns the same quote detail shape as quotes.get', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createQuote(caller, context.product.id);
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getQuoteTool.handler({ id: created.id }, createAiContext(context.db, access)),
      caller.quotes.get({ id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult).toMatchObject({
      depositPercent: 30,
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-10',
    });
  });

  test('surfaces the core not-found message for missing quotes', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(
      getQuoteTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Quote not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid quote get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(getQuoteTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});

async function createQuote(caller: AppRouterCaller, productId: string) {
  return caller.quotes.create({
    customer: {
      type: 'inline',
      companyName: 'Ready Customer',
    },
    depositPercent: 30,
    discountPercent: 10,
    notes: null,
    documentNotes: '30% deposit, balance on delivery',
    plannedDeliveryDate: '2026-07-15',
    preferredDeliveryDate: '2026-07-10',
    productId,
    salesPersonId: 'test-user-id',
    status: 'draft',
    validUntil: '2026-06-30',
  });
}

async function createProduct(db: Db) {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      buildTimeDays: 14,
      modelCode: 'QUOTE-GET-001',
      name: 'Quote Get Product',
      rangeId,
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}
