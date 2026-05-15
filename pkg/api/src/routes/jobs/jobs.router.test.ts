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
      [3, 'assembly', 'pending'],
      [4, 'paint', 'pending'],
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
      { access: 'locked', sequence: 3, stage: 'assembly' },
      { access: 'visible', sequence: 4, stage: 'paint', status: 'pending' },
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
      { access: 'visible', sequence: 3, stage: 'assembly' },
      { access: 'visible', sequence: 4, stage: 'paint' },
      { access: 'visible', sequence: 5, stage: 'dispatch' },
    ]);
  });
});

describe('job stage transitions', () => {
  test('starts, updates status, and completes a stage with audit events', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    const started = await caller.jobs.startStage({ id: created.id, stage: 'procurement' });
    const procurementAfterStart = getVisibleStage(started, 'procurement');
    expect(procurementAfterStart.startedAt).toEqual(expect.any(String));
    expect(procurementAfterStart.completedAt).toBeNull();

    const statusUpdated = await caller.jobs.setStageStatus({
      id: created.id,
      stage: 'procurement',
      status: 'ordering',
    });
    expect(getVisibleStage(statusUpdated, 'procurement').status).toBe('ordering');

    const completed = await caller.jobs.completeStage({ id: created.id, stage: 'procurement' });
    const procurementAfterComplete = getVisibleStage(completed, 'procurement');
    expect(procurementAfterComplete.completedAt).toEqual(expect.any(String));
    expect(procurementAfterComplete.status).toBe('ordering');
    expect(getVisibleStage(completed, 'fabrication').transitionAvailability?.start).toEqual({
      allowed: true,
      reason: null,
    });

    const auditRows = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    expect(auditRows).toHaveLength(4);
    expect(auditRows.slice(1)).toMatchObject([
      {
        action: 'updated',
        actorUserId: 'test-user-id',
        entityId: procurementAfterStart.id,
        entityType: 'job_stage',
        summary: 'Updated job stage "procurement"',
      },
      {
        action: 'updated',
        actorUserId: 'test-user-id',
        entityId: procurementAfterStart.id,
        entityType: 'job_stage',
        summary: 'Updated job stage "procurement"',
      },
      {
        action: 'updated',
        actorUserId: 'test-user-id',
        entityId: procurementAfterStart.id,
        entityType: 'job_stage',
        summary: 'Updated job stage "procurement"',
      },
    ]);
    expect(auditRows[1]?.changes).toHaveProperty('startedAt');
    expect(auditRows[2]?.changes).toEqual({
      status: {
        from: 'pending',
        to: 'ordering',
      },
    });
    expect(auditRows[3]?.changes).toHaveProperty('completedAt');
  });

  test('rejects starting a stage before the previous stage completes', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await expect(caller.jobs.startStage({ id: created.id, stage: 'fabrication' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Previous stage is not complete.',
    });
  });

  test('rejects completing a stage twice', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await caller.jobs.startStage({ id: created.id, stage: 'procurement' });
    await caller.jobs.completeStage({ id: created.id, stage: 'procurement' });

    await expect(caller.jobs.completeStage({ id: created.id, stage: 'procurement' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Stage is already complete.',
    });
  });

  test('allows status updates after completion', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await caller.jobs.startStage({ id: created.id, stage: 'procurement' });
    await caller.jobs.completeStage({ id: created.id, stage: 'procurement' });
    const updated = await caller.jobs.setStageStatus({
      id: created.id,
      stage: 'procurement',
      status: 'partial',
    });

    expect(getVisibleStage(updated, 'procurement').status).toBe('partial');
  });

  test('rejects writers outside the owning department', async ({ context }) => {
    const paintCaller = createJobCaller(context.createCallerWithAccess, 'job-stage-editor', ['paint']);
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const created = await supervisorCaller.jobs.create({ productId: context.product.id });

    await expect(paintCaller.jobs.startStage({ id: created.id, stage: 'procurement' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You do not have access to update this stage.',
    });
  });

  test('rejects empty status updates at the input boundary', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await expect(
      caller.jobs.setStageStatus({
        id: created.id,
        stage: 'procurement',
        status: '',
      } as unknown as Parameters<typeof caller.jobs.setStageStatus>[0]),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  test('rejects statuses from another stage at the input boundary', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await expect(
      caller.jobs.setStageStatus({
        id: created.id,
        stage: 'procurement',
        status: 'welding',
      } as unknown as Parameters<typeof caller.jobs.setStageStatus>[0]),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
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

function getVisibleStage(job: Awaited<ReturnType<TestCaller['jobs']['get']>>, stage: Department) {
  const jobStage = job.stages.find((item) => item.stage === stage);

  if (!jobStage || jobStage.access !== 'visible') {
    throw new Error(`Expected visible ${stage} stage`);
  }

  return jobStage;
}
