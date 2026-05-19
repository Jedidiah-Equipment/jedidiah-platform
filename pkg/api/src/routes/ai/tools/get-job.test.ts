import { type Db, products } from '@pkg/db';
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
  await createActorUser(db, 'job-supervisor');
  const product = await createProduct(db);

  return { db, product };
});

describe('getJobTool', () => {
  test('returns the same job detail shape as jobs.get with stage visibility enforced', async ({ context }) => {
    const supervisorAccess = createUserAccessSummary({
      role: 'job-supervisor',
      userId: 'test-user-id',
    });
    const paintAccess = createUserAccessSummary({
      departments: ['paint'],
      role: 'job-stage-editor',
      userId: 'test-user-id',
    });
    const supervisorCaller = createCaller(context.db, supervisorAccess);
    const paintCaller = createCaller(context.db, paintAccess);
    const created = await supervisorCaller.jobs.create({ productId: context.product.id });
    await supervisorCaller.jobs.startStage({ id: created.id, stage: 'procurement' });

    const [toolResult, trpcResult] = await Promise.all([
      getJobTool.handler({ id: created.id }, createAiContext(context.db, paintAccess)),
      paintCaller.jobs.get({ id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult.stages.find((stage) => stage.stage === 'procurement')).toMatchObject({
      access: 'summary',
    });
    expect(toolResult.stages.find((stage) => stage.stage === 'paint')).toMatchObject({
      access: 'visible',
    });
  });

  test('surfaces the core not-found message for missing jobs', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'job-supervisor',
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
      role: 'job-supervisor',
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
  });
}

async function createProduct(db: Db): Promise<Product> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      modelCode: 'JOB-GET-001',
      name: 'Job Get Product',
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
