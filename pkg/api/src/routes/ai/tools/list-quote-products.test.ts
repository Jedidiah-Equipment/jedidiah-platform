import * as core from '@pkg/core';
import { type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { Product, ProductListInput, UserAccessSummary } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { listQuoteProductsTool } from '@/routes/ai/tools/list-quote-products.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('listQuoteProductsTool', () => {
  test('returns the same product list result shape as quotes.products', async ({ context }) => {
    const adminCaller = context.createCaller();
    const salesCaller = context.createCaller(mockSession('sales'));
    await createProduct(adminCaller, 'Compact Loader', { modelCode: 'CL-100' });
    await createProduct(adminCaller, 'Excavator Bucket', { modelCode: 'EX-200' });

    const input: ProductListInput = {
      page: 1,
      pageSize: 10,
      columnFilters: {
        modelCode: 'CL',
      },
      search: 'loader',
      sortBy: 'name',
      sortDirection: 'asc',
    };
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listQuoteProductsTool.handler(input, createAiContext(context.db, access)),
      salesCaller.quotes.products(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default quote product list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });
    const listProductsSpy = vi.spyOn(core, 'listProducts').mockResolvedValue({
      items: [],
      sortBy: 'name',
      sortDirection: 'asc',
      total: 0,
    });

    try {
      await listQuoteProductsTool.handler(null, createAiContext(context.db, access));

      expect(listProductsSpy).toHaveBeenCalledWith({
        db: context.db,
        input: expect.objectContaining({
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'name',
          sortDirection: 'asc',
        }),
        log: expect.objectContaining({
          service: expect.objectContaining({
            debug: expect.any(Function),
          }),
        }),
      });
    } finally {
      listProductsSpy.mockRestore();
    }
  });

  test('rejects invalid quote product list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(
      listQuoteProductsTool.handler({ sortBy: 'bad-sort' }, createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});

async function createProduct(
  caller: AppRouterCaller,
  name: string,
  overrides: Partial<Parameters<AppRouterCaller['products']['create']>[0]> = {},
): Promise<Product> {
  return caller.products.create({
    basePrice: 1_000,
    description: null,
    modelCode: name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    name,
    ...overrides,
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
