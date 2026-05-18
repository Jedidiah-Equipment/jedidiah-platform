import { type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { Product, UserAccessSummary } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { getProductTool } from '@/routes/ai/tools/get-product.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('getProductTool', () => {
  test('returns the same product result shape as products.get', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Compact Loader');
    const access = createUserAccessSummary({
      role: 'product-viewer',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getProductTool.handler({ id: created.id }, createAiContext(context.db, access)),
      caller.products.get({ id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('rejects invalid product get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'product-viewer',
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
    modelCode: name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    name,
  });
}

function createAiContext(db: Db, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role ?? 'product-viewer'),
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
    role: 'admin',
    updatedAt: now,
  });
}
