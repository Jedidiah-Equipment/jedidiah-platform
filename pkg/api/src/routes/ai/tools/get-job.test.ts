import { customers, type Db, products, quotes } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { Product, type UserAccessSummary } from '@pkg/schema';
import pino from 'pino';
import { describe, expect } from 'vitest';
import { z } from 'zod';

import { getJobTool } from '@/routes/ai/tools/get-job.js';
import { createActorUser, createAiContext } from '@/test/ai-tools.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'admin');
  const product = await createProduct(db);
  const quote = await createAcceptedQuote(db, product.id);

  return { db, product, quote };
});

describe('getJobTool', () => {
  test('returns the same job detail shape as jobs.get', async ({ context }) => {
    const adminAccess = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const viewerAccess = createUserAccessSummary({
      role: 'job-viewer',
      userId: 'test-user-id',
    });
    const adminCaller = createCaller(context.db, adminAccess);
    const viewerCaller = createCaller(context.db, viewerAccess);
    const created = await adminCaller.jobs.create({ quoteId: context.quote.id });

    const [toolResult, trpcResult] = await Promise.all([
      getJobTool.handler({ id: created.id }, createAiContext(context.db, viewerAccess)),
      viewerCaller.jobs.get({ id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult.schedule.map((item) => item.department)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
  });

  test('surfaces the core not-found message for missing jobs', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      getJobTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Job not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid job get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(getJobTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
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
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      buildTimeDays: 14,
      modelCode: 'JOB-GET-001',
      name: 'Job Get Product',
      rangeId: '00000000-0000-4000-8000-000000000488',
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
