import { type Db, products, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { getQuoteTool } from '@/routes/ai/tools/get-quote.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
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
    discount: 100,
    notes: null,
    productId,
    salesPersonId: 'test-user-id',
    validUntil: '2026-06-30',
  });
}

function createAiContext(db: Db, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role ?? 'sales'),
  };
}

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'sales',
    updatedAt: now,
  });
}

async function createProduct(db: Db) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      modelCode: 'QUOTE-GET-001',
      name: 'Quote Get Product',
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}
