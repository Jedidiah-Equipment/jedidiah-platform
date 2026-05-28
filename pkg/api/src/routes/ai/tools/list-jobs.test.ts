import * as core from '@pkg/core';
import { type Db, products, sql } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { type JobListInput, Product, type UserAccessSummary } from '@pkg/schema';
import pino from 'pino';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import { listJobsTool } from '@/routes/ai/tools/list-jobs.js';
import { createActorUser, createAiContext } from '@/test/ai-tools.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'job-supervisor');
  const product = await createProduct(db);

  return { db, product };
});

describe('listJobsTool', () => {
  test('returns the same job list result shape as jobs.list', async ({ context }) => {
    const supervisorAccess = createUserAccessSummary({
      role: 'job-supervisor',
      userId: 'test-user-id',
    });
    const supervisorCaller = createCaller(context.db, supervisorAccess);
    const created = await supervisorCaller.jobs.create({ productId: context.product.id });
    const input: JobListInput = {
      filters: { statuses: [] },
      page: 1,
      pageSize: 10,
      search: created.code,
      sortBy: 'code',
      sortDirection: 'asc',
    };

    const [toolResult, trpcResult] = await Promise.all([
      listJobsTool.handler(input, createAiContext(context.db, supervisorAccess)),
      supervisorCaller.jobs.list(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('supports stored Job Status filters described to the assistant', async ({ context }) => {
    const supervisorAccess = createUserAccessSummary({
      role: 'job-supervisor',
      userId: 'test-user-id',
    });
    const supervisorCaller = createCaller(context.db, supervisorAccess);
    const activeJob = await supervisorCaller.jobs.create({ productId: context.product.id });
    const pausedJob = await supervisorCaller.jobs.create({ productId: context.product.id });
    await context.db.execute(sql`
      update job
      set status = 'active'
      where id = ${activeJob.id}
    `);
    await context.db.execute(sql`
      update job
      set status = 'paused'
      where id = ${pausedJob.id}
    `);
    const input: JobListInput = {
      filters: { statuses: ['active'] },
      page: 1,
      pageSize: 10,
      search: '',
      sortBy: 'code',
      sortDirection: 'asc',
    };

    const result = await listJobsTool.handler(input, createAiContext(context.db, supervisorAccess));

    expect(result.items.map((job) => job.id)).toEqual([activeJob.id]);
  });

  test('treats null tool args as the default job list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'job-supervisor',
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
        access,
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
      role: 'job-supervisor',
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
  });
}

async function createProduct(db: Db): Promise<Product> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      buildTimeDays: 14,
      modelCode: 'JOB-TOOL-001',
      name: 'Job Tool Product',
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return Product.parse({
    ...product,
    createdAt: product.createdAt.toISOString(),
    options: [],
    updatedAt: product.updatedAt.toISOString(),
  });
}
