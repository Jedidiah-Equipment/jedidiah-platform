import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { Logger, ProductListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';
import { createActorUser, createAiContext } from '../test/ai-tools.js';
import { createTester } from '../test/create-tester.js';
import { createProductFixture } from '../test/domain-fixtures.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { listQuoteProductsTool } from './list-quote-products.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'sales');
  const rangeId = await createProductRangeFixture(db);

  return { db, rangeId };
});

describe('listQuoteProductsTool', () => {
  test('returns the same product list result shape as quotes.products', async ({ context }) => {
    await createProductFixture(context.db, 'Compact Loader', context.rangeId, { modelCode: 'CL-100' });
    await createProductFixture(context.db, 'Excavator Bucket', context.rangeId, { modelCode: 'EX-200' });

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
      core.listProducts({
        db: context.db,
        input,
        log: createCoreLogger(createAiContext(context.db, access).log),
      }),
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

function createCoreLogger(log: ReturnType<typeof createAiContext>['log']): Logger {
  return {
    ai: log,
    http: log,
    root: log,
    service: log,
  } as unknown as Logger;
}
