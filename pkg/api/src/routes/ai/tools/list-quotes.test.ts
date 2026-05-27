import * as core from '@pkg/core';
import { type Db, products } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { QuoteListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import { listQuotesTool } from '@/routes/ai/tools/list-quotes.js';
import { createActorUser, createAiContext } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'sales');
  const product = await createProduct(db);

  return { db, product };
});

describe('listQuotesTool', () => {
  test('returns the same quote list result shape as quotes.list', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));
    const created = await createQuote(caller, context.product.id);
    const input: QuoteListInput = {
      filters: {
        statuses: ['draft'],
      },
      page: 1,
      pageSize: 10,
      search: created.code,
      sortBy: 'code',
      sortDirection: 'asc',
    };
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listQuotesTool.handler(input, createAiContext(context.db, access)),
      caller.quotes.list(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult.items[0]).toMatchObject({
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-10',
    });
  });

  test('treats null tool args as the default quote list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });
    const listQuotesSpy = vi.spyOn(core, 'listQuotes').mockResolvedValue({
      items: [],
      sortBy: 'createdAt',
      sortDirection: 'desc',
      total: 0,
    });

    try {
      await listQuotesTool.handler(null, createAiContext(context.db, access));

      expect(listQuotesSpy).toHaveBeenCalledWith({
        db: context.db,
        input: expect.objectContaining({
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'createdAt',
          sortDirection: 'desc',
        }),
      });
    } finally {
      listQuotesSpy.mockRestore();
    }
  });

  test('rejects invalid quote list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(
      listQuotesTool.handler({ sortBy: 'bad-sort' }, createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
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
    paymentTerms: '30% deposit, balance on delivery',
    plannedDeliveryDate: '2026-07-15',
    preferredDeliveryDate: '2026-07-10',
    productId,
    salesPersonId: 'test-user-id',
    validUntil: '2026-06-30',
  });
}

async function createProduct(db: Db) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      leadTimeDays: 14,
      modelCode: 'QUOTE-LIST-001',
      name: 'Quote List Product',
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}
