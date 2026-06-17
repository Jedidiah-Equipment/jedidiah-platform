import * as productsCore from '@pkg/core';
import { type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { Product, ProductListInput, UserAccessSummary } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { listProductsTool } from '@/routes/ai/tools/list-products.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const LEGACY_PRODUCT_RANGE_ID = '00000000-0000-4000-8000-000000000488';

async function createProduct(
  caller: AppRouterCaller,
  name: string,
  overrides: Partial<Parameters<AppRouterCaller['products']['create']>[0]> = {},
): Promise<Product> {
  return caller.products.create({
    basePrice: 1_000,
    description: null,
    buildTimeDays: 14,
    modelCode: createModelCode(name),
    name,
    rangeId: LEGACY_PRODUCT_RANGE_ID,
    ...overrides,
  });
}

function createModelCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function createAiContext(db: Db, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role),
    storage: {} as AiContext['storage'],
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

describe('listProductsTool', () => {
  test('returns the same product list result shape as products.list', async ({ context }) => {
    const adminCaller = context.createCaller();
    const editorCaller = context.createCaller(mockSession('procurement-manager'));
    await createProduct(adminCaller, 'Compact Loader', {
      modelCode: 'CL-100',
      thumbnailDataUrl: 'data:image/webp;base64,aaaa',
    });
    await createProduct(adminCaller, 'Excavator Bucket', {
      modelCode: 'EX-200',
    });

    const input: ProductListInput = {
      page: 1,
      pageSize: 10,
      columnFilters: {
        modelCode: 'CL',
      },
      search: 'loader',
      sortBy: 'name',
      sortDirection: 'asc',
    } as const;
    const access = createUserAccessSummary({
      role: 'procurement-manager',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listProductsTool.handler(input, createAiContext(context.db, access)),
      editorCaller.products.list(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default product list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'procurement-manager',
      userId: 'test-user-id',
    });
    const listProductsSpy = vi.spyOn(productsCore, 'listProducts').mockResolvedValue({
      items: [],
      sortBy: 'name',
      sortDirection: 'asc',
      total: 0,
    });

    try {
      await listProductsTool.handler(null, createAiContext(context.db, access));

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

  test('rejects invalid product list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'procurement-manager',
      userId: 'test-user-id',
    });

    await expect(
      listProductsTool.handler(
        {
          sortBy: 'bad-sort',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
