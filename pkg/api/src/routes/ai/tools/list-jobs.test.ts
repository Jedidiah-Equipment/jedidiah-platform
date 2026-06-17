import * as core from '@pkg/core';
import { customers, type Db, products, quotes } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { type JobListInput, Product, type UserAccessSummary } from '@pkg/schema';
import pino from 'pino';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import { listJobsTool } from '@/routes/ai/tools/list-jobs.js';
import { createActorUser, createAiContext } from '@/test/ai-tools.js';
import { createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'admin');
  const product = await createProduct(db);
  const quote = await createAcceptedQuote(db, product.id);

  return { db, product, quote };
});

describe('listJobsTool', () => {
  test('returns the same job list result shape as jobs.list', async ({ context }) => {
    const adminAccess = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const adminCaller = createCaller(context.db, adminAccess);
    const created = await adminCaller.jobs.create({ quoteId: context.quote.id });
    const input: JobListInput = {
      filters: {},
      page: 1,
      pageSize: 10,
      search: created.code,
      sortBy: 'code',
      sortDirection: 'asc',
    };

    const [toolResult, trpcResult] = await Promise.all([
      listJobsTool.handler(input, createAiContext(context.db, adminAccess)),
      adminCaller.jobs.list(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default job list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const listJobsSpy = vi.spyOn(core, 'listJobs').mockResolvedValue({
      items: [],
      sortBy: 'createdAt',
      sortDirection: 'asc',
      total: 0,
    });

    try {
      await listJobsTool.handler(null, createAiContext(context.db, access));

      expect(listJobsSpy).toHaveBeenCalledWith({
        db: context.db,
        input: expect.objectContaining({
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'createdAt',
          sortDirection: 'asc',
        }),
      });
    } finally {
      listJobsSpy.mockRestore();
    }
  });

  test('rejects invalid job list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      listJobsTool.handler({ sortBy: 'bad-sort' }, createAiContext(context.db, access)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});

function createCaller(db: Db, access: UserAccessSummary) {
  return createAppRouterCaller({
    access,
    db,
    log: pino({ level: 'silent' }),
    session: mockSession(access.role),
    storage: {
      deleteObject: async () => undefined,
      get: async () => {
        throw new Error('Storage object not found');
      },
      put: async () => undefined,
    },
  });
}

async function createAcceptedQuote(db: Db, productId: Product['id']) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Job Tool Customer',
      email: null,
    })
    .returning({ id: customers.id });
  if (!customer) {
    throw new Error('Customer insert did not return a row');
  }

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      status: 'accepted',
    })
    .returning({ id: quotes.id });
  if (!quote) {
    throw new Error('Quote insert did not return a row');
  }

  return quote;
}

async function createProduct(db: Db): Promise<Product> {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      buildTimeDays: 14,
      modelCode: 'JOB-TOOL-001',
      name: 'Job Tool Product',
      rangeId,
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return Product.parse({
    ...product,
    createdAt: product.createdAt.toISOString(),
    options: [],
    rangeId: product.rangeId,
    updatedAt: product.updatedAt.toISOString(),
  });
}
