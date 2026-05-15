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

const pipelineStages = ['procurement', 'fabrication', 'assembly', 'paint', 'dispatch'] as const satisfies Department[];

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

  test('returns not found for a missing job', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));

    await expect(caller.jobs.get({ id: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Job not found.',
    });
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
    expect(procurementAfterComplete.status).toBe('complete');
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
    expect(auditRows[3]?.changes).toHaveProperty('status');
  });

  test('allows a stage editor to update their own stage once the pipeline reaches it', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const paintCaller = createJobCaller(context.createCallerWithAccess, 'job-stage-editor', ['paint']);
    const created = await supervisorCaller.jobs.create({ productId: context.product.id });

    await completeStages(supervisorCaller, created.id, ['procurement', 'fabrication', 'assembly']);
    const started = await paintCaller.jobs.startStage({ id: created.id, stage: 'paint' });
    const updated = await paintCaller.jobs.setStageStatus({
      id: created.id,
      stage: 'paint',
      status: 'painting',
    });

    expect(getVisibleStage(started, 'paint').startedAt).toEqual(expect.any(String));
    expect(getVisibleStage(updated, 'paint').status).toBe('painting');
  });

  test('advances through the whole pipeline in sequence', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });
    let detail = created;

    for (const [index, stage] of pipelineStages.entries()) {
      detail = await caller.jobs.startStage({ id: created.id, stage });
      expect(getVisibleStage(detail, stage).startedAt).toEqual(expect.any(String));

      detail = await caller.jobs.completeStage({ id: created.id, stage });
      const completedStage = getVisibleStage(detail, stage);
      expect(completedStage.completedAt).toEqual(expect.any(String));
      expect(completedStage.status).toBe('complete');

      const nextStage = pipelineStages[index + 1];
      if (nextStage) {
        expect(getVisibleStage(detail, nextStage).transitionAvailability?.start).toEqual({
          allowed: true,
          reason: null,
        });
      }
    }

    expect(detail.stages).toHaveLength(5);
    expect(
      detail.stages.every((stage) => stage.access === 'visible' && stage.status === 'complete' && stage.completedAt),
    ).toBe(true);
  });

  test('rejects starting a stage before the previous stage completes', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await expect(caller.jobs.startStage({ id: created.id, stage: 'fabrication' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Previous stage is not complete.',
    });
  });

  test('rejects starting a stage twice', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await caller.jobs.startStage({ id: created.id, stage: 'procurement' });

    await expect(caller.jobs.startStage({ id: created.id, stage: 'procurement' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Stage has already started.',
    });
  });

  test('rejects completing a stage before it starts', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await expect(caller.jobs.completeStage({ id: created.id, stage: 'procurement' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Stage has not started.',
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

  test('rejects status updates before a stage starts', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await expect(
      caller.jobs.setStageStatus({
        id: created.id,
        stage: 'procurement',
        status: 'ordering',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Stage has not started.',
    });
  });

  test('rejects complete status updates before a stage starts', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await expect(
      caller.jobs.setStageStatus({
        id: created.id,
        stage: 'procurement',
        status: 'complete',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Stage has not started.',
    });
  });

  test('allows status updates after completion', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await caller.jobs.startStage({ id: created.id, stage: 'procurement' });
    const completed = await caller.jobs.completeStage({ id: created.id, stage: 'procurement' });
    const completedAt = getVisibleStage(completed, 'procurement').completedAt;
    const updated = await caller.jobs.setStageStatus({
      id: created.id,
      stage: 'procurement',
      status: 'partial',
    });

    const procurement = getVisibleStage(updated, 'procurement');
    expect(procurement.status).toBe('partial');
    expect(procurement.completedAt).toBe(completedAt);

    const auditRows = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    expect(auditRows.at(-1)?.changes).toEqual({
      status: {
        from: 'complete',
        to: 'partial',
      },
    });
  });

  test('complete status updates complete the stage and preserve completion history afterward', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await caller.jobs.startStage({ id: created.id, stage: 'procurement' });

    const completed = await caller.jobs.setStageStatus({
      id: created.id,
      stage: 'procurement',
      status: 'complete',
    });
    const procurementAfterComplete = getVisibleStage(completed, 'procurement');
    expect(procurementAfterComplete.status).toBe('complete');
    expect(procurementAfterComplete.completedAt).toEqual(expect.any(String));

    const auditRowsAfterComplete = await context.db.select().from(auditEvents);
    const editedAfterCompletion = await caller.jobs.setStageStatus({
      id: created.id,
      stage: 'procurement',
      status: 'partial',
    });
    const procurementAfterEdit = getVisibleStage(editedAfterCompletion, 'procurement');
    expect(procurementAfterEdit.status).toBe('partial');
    expect(procurementAfterEdit.completedAt).toBe(procurementAfterComplete.completedAt);

    const completedAgain = await caller.jobs.setStageStatus({
      id: created.id,
      stage: 'procurement',
      status: 'complete',
    });
    const procurementAfterStatusComplete = getVisibleStage(completedAgain, 'procurement');
    expect(procurementAfterStatusComplete.status).toBe('complete');
    expect(procurementAfterStatusComplete.completedAt).toBe(procurementAfterComplete.completedAt);

    const auditRowsAfterStatusComplete = await context.db.select().from(auditEvents);
    const noop = await caller.jobs.setStageStatus({
      id: created.id,
      stage: 'procurement',
      status: 'complete',
    });
    const auditRowsAfterNoop = await context.db.select().from(auditEvents);

    expect(getVisibleStage(noop, 'procurement').completedAt).toBe(procurementAfterComplete.completedAt);
    expect(auditRowsAfterStatusComplete).toHaveLength(auditRowsAfterComplete.length + 2);
    expect(auditRowsAfterNoop).toHaveLength(auditRowsAfterStatusComplete.length);
  });

  test('complete status no-ops still require access to the completed stage', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const paintCaller = createJobCaller(context.createCallerWithAccess, 'job-stage-editor', ['paint']);
    const created = await supervisorCaller.jobs.create({ productId: context.product.id });

    await supervisorCaller.jobs.startStage({ id: created.id, stage: 'procurement' });
    await supervisorCaller.jobs.completeStage({ id: created.id, stage: 'procurement' });

    await expect(
      paintCaller.jobs.setStageStatus({
        id: created.id,
        stage: 'procurement',
        status: 'complete',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You do not have access to update this stage.',
    });
  });

  test('rejects stage writes while the job lifecycle is not active', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const created = await caller.jobs.create({ productId: context.product.id });

    await context.db.update(jobs).set({ lifecycleStatus: 'paused' });

    await expect(caller.jobs.startStage({ id: created.id, stage: 'procurement' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Job is not active.',
    });
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

  test('returns not found for transitions on a missing job', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));

    await expect(
      caller.jobs.startStage({ id: '00000000-0000-4000-8000-000000000000', stage: 'procurement' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Job not found.',
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

async function completeStages(caller: TestCaller, id: string, stages: Department[]) {
  for (const stage of stages) {
    await caller.jobs.startStage({ id, stage });
    await caller.jobs.completeStage({ id, stage });
  }
}
