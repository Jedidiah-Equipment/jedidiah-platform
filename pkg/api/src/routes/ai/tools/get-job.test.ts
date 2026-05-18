import { type Db, products, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { Product, type UserAccessSummary } from '@pkg/schema';
import pino from 'pino';
import { describe, expect } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { getJobTool } from '@/routes/ai/tools/get-job.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
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

  test('rejects invalid job get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'job-viewer',
      userId: 'test-user-id',
    });

    await expect(getJobTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});

function createAiContext(db: Db, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role ?? 'job-viewer'),
  };
}

function createCaller(db: Db, access: UserAccessSummary) {
  return createAppRouterCaller({
    access,
    db,
    log: pino({ level: 'silent' }),
    session: mockSession(access.role),
  });
}

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'job-supervisor',
    updatedAt: now,
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
