import { auditEvents, type Db, jobStages, jobs, products, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { AppRole, Department, UserAccessSummary } from '@pkg/schema';
import pino from 'pino';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProduct(db);

  return {
    createCallerWithAccess: (access: UserAccessSummary) =>
      createAppRouterCaller({
        access,
        db,
        log: pino({ level: 'silent' }),
        session: mockSession(access.role),
      }),
    db,
    product,
  };
});

type TestCaller = AppRouterCaller;

describe('jobs.create', () => {
  test('creates a job and all five stage rows in one transaction', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({
      productId: context.product.id,
    });

    const jobRows = await context.db.select().from(jobs);
    const stageRows = await context.db.select().from(jobStages).orderBy(jobStages.sequence);
    const auditRows = await context.db.select().from(auditEvents);

    expect(jobRows).toHaveLength(1);
    expect(jobRows[0]?.id).toBe(created.id);
    expect(stageRows).toHaveLength(5);
    expect(stageRows.every((stage) => stage.jobId === created.id)).toBe(true);
    expect(stageRows.map((stage) => [stage.sequence, stage.stage, stage.status])).toEqual([
      [1, 'procurement', 'pending'],
      [2, 'fabrication', 'pending'],
      [3, 'paint', 'pending'],
      [4, 'assembly', 'pending'],
      [5, 'dispatch', 'pending'],
    ]);
    expect(created.stages).toHaveLength(5);
    expect(auditRows).toMatchObject([
      {
        action: 'created',
        actorUserId: 'test-user-id',
        entityId: created.id,
        entityType: 'job',
        summary: `Created job "${created.id}"`,
      },
    ]);
  });

  test('rejects users without job create permission', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-viewer'));

    await expect(caller.jobs.create({ productId: context.product.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('jobs.list', () => {
  test('returns all jobs for cross-cutting job viewers', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const viewerCaller = context.createCaller(mockSession('job-viewer'));

    const created = await supervisorCaller.jobs.create({ productId: context.product.id });
    const result = await viewerCaller.jobs.list({});

    expect(result.jobs.map((job) => job.id)).toEqual([created.id]);
  });

  test('returns department-scoped jobs for matching stage editors', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const paintCaller = createJobCaller(context.createCallerWithAccess, 'job-stage-editor', ['paint']);

    const created = await supervisorCaller.jobs.create({ productId: context.product.id });
    const result = await paintCaller.jobs.list({});

    expect(result.jobs.map((job) => job.id)).toEqual([created.id]);
  });

  test('rejects users without job read permission', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const productViewerCaller = context.createCaller(mockSession('product-viewer'));

    await supervisorCaller.jobs.create({ productId: context.product.id });

    await expect(productViewerCaller.jobs.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('jobs.get', () => {
  test('locks stage detail outside a stage editor department', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const paintCaller = createJobCaller(context.createCallerWithAccess, 'job-stage-editor', ['paint']);

    const created = await supervisorCaller.jobs.create({ productId: context.product.id });
    const detail = await paintCaller.jobs.get({ id: created.id });

    expect(detail.stages).toMatchObject([
      { access: 'locked', sequence: 1, stage: 'procurement' },
      { access: 'locked', sequence: 2, stage: 'fabrication' },
      { access: 'visible', sequence: 3, stage: 'paint', status: 'pending' },
      { access: 'locked', sequence: 4, stage: 'assembly' },
      { access: 'locked', sequence: 5, stage: 'dispatch' },
    ]);
    expect(detail.stages[0]).not.toHaveProperty('id');
  });

  test('shows all stages to stage editors with no selected departments', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const noDepartmentCaller = createJobCaller(context.createCallerWithAccess, 'job-stage-editor', []);

    const created = await supervisorCaller.jobs.create({ productId: context.product.id });
    const detail = await noDepartmentCaller.jobs.get({ id: created.id });

    expect(detail.stages).toMatchObject([
      { access: 'visible', sequence: 1, stage: 'procurement' },
      { access: 'visible', sequence: 2, stage: 'fabrication' },
      { access: 'visible', sequence: 3, stage: 'paint' },
      { access: 'visible', sequence: 4, stage: 'assembly' },
      { access: 'visible', sequence: 5, stage: 'dispatch' },
    ]);
  });
});

async function createProduct(db: Db) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      modelCode: 'JOB-TEST-PRODUCT',
      name: 'Job Test Product',
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
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

function createJobCaller(
  createCallerWithAccess: (access: UserAccessSummary) => TestCaller,
  role: AppRole,
  departments: Department[],
) {
  return createCallerWithAccess(
    createUserAccessSummary({
      departments,
      role,
      userId: 'test-user-id',
    }),
  );
}
