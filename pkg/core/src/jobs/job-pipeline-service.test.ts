import { auditEvents, type Db, jobEvents, jobStages, jobs, products, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { Department, JobDetail } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { applyJobStageTransition } from './job-pipeline-service.js';
import { createJob } from './job-service.js';

type TestContext = {
  db: Db;
  product: typeof products.$inferSelect;
};

const actorUserId = 'test-user-id';
const pipelineStages = ['procurement', 'fabrication', 'assembly', 'paint', 'dispatch'] as const satisfies Department[];
const supervisorAccess = createAccess('job-supervisor', []);

const test = createTester<TestContext>(async ({ db }) => {
  await createActorUser(db);
  const product = await createProduct(db);

  return {
    db,
    product,
  };
});

describe('applyJobStageTransition', () => {
  test('starts, updates, and completes a stage with audit events, workflow events, and aggregate readback', async ({
    context,
  }) => {
    const created = await createTestJob(context);

    const started = await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { transition: 'start' },
      stage: 'procurement',
    });
    expect(getVisibleStage(started, 'procurement')).toMatchObject({
      completedAt: null,
      startedAt: expect.any(String),
      status: 'pending',
    });

    const statusUpdated = await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { status: 'ordering', transition: 'set-status' },
      stage: 'procurement',
    });
    expect(getVisibleStage(statusUpdated, 'procurement').status).toBe('ordering');

    const completed = await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { transition: 'complete' },
      stage: 'procurement',
    });
    expect(getVisibleStage(completed, 'procurement')).toMatchObject({
      completedAt: expect.any(String),
      status: 'complete',
    });
    expect(getVisibleStage(completed, 'fabrication').transitionAvailability?.start).toEqual({
      allowed: true,
      reason: null,
    });

    const auditRows = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    expect(auditRows).toHaveLength(4);
    expect(auditRows.slice(1).map((event) => event.entityType)).toEqual(['job_stage', 'job_stage', 'job_stage']);
    expect(auditRows[1]?.changes).toHaveProperty('startedAt');
    expect(auditRows[2]?.changes).toEqual({
      status: {
        from: 'pending',
        to: 'ordering',
      },
    });
    expect(auditRows[3]?.changes).toMatchObject({
      status: {
        from: 'ordering',
        to: 'complete',
      },
    });

    const workflowRows = await context.db.select().from(jobEvents).orderBy(jobEvents.occurredAt);
    expect(workflowRows).toMatchObject([
      {
        eventType: 'stage.started',
        jobId: created.id,
        stageId: getVisibleStage(completed, 'procurement').id,
      },
      {
        eventType: 'stage.status_changed',
        jobId: created.id,
        stageId: getVisibleStage(completed, 'procurement').id,
      },
      {
        eventType: 'stage.completed',
        jobId: created.id,
        stageId: getVisibleStage(completed, 'procurement').id,
      },
    ]);
    expect(completed.workflowEvents.map((event) => event.eventType)).toEqual([
      'stage.completed',
      'stage.status_changed',
      'stage.started',
    ]);
  });

  test('keeps complete-status updates on the same latch and suppresses true no-op logs', async ({ context }) => {
    const created = await createTestJob(context);

    await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { transition: 'start' },
      stage: 'procurement',
    });

    const completed = await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { status: 'complete', transition: 'set-status' },
      stage: 'procurement',
    });
    const completedAt = getVisibleStage(completed, 'procurement').completedAt;
    expect(completedAt).toEqual(expect.any(String));

    await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { status: 'partial', transition: 'set-status' },
      stage: 'procurement',
    });
    const relocked = await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { status: 'complete', transition: 'set-status' },
      stage: 'procurement',
    });
    expect(getVisibleStage(relocked, 'procurement').completedAt).toBe(completedAt);

    const auditCountBeforeNoop = (await context.db.select().from(auditEvents)).length;
    const eventCountBeforeNoop = (await context.db.select().from(jobEvents)).length;
    const noop = await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { status: 'complete', transition: 'set-status' },
      stage: 'procurement',
    });

    expect(getVisibleStage(noop, 'procurement').completedAt).toBe(completedAt);
    expect(await context.db.select().from(auditEvents)).toHaveLength(auditCountBeforeNoop);
    expect(await context.db.select().from(jobEvents)).toHaveLength(eventCountBeforeNoop);
  });

  test('denies transitions without mutating stage, audit, or workflow history', async ({ context }) => {
    const created = await createTestJob(context);
    const stageRowsBefore = await context.db
      .select()
      .from(jobStages)
      .where(eq(jobStages.jobId, created.id))
      .orderBy(jobStages.sequence);

    await expect(
      applyJobStageTransition({
        access: supervisorAccess,
        actorUserId,
        db: context.db,
        id: created.id,
        intent: { transition: 'start' },
        stage: 'fabrication',
      }),
    ).rejects.toMatchObject({
      message: 'Previous stage is not complete.',
    });

    expect(await context.db.select().from(auditEvents)).toHaveLength(1);
    expect(await context.db.select().from(jobEvents)).toHaveLength(0);
    expect(
      await context.db.select().from(jobStages).where(eq(jobStages.jobId, created.id)).orderBy(jobStages.sequence),
    ).toEqual(stageRowsBefore);
  });

  test('denies explicit completion after a stage is already complete', async ({ context }) => {
    const created = await createTestJob(context);

    await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { transition: 'start' },
      stage: 'procurement',
    });
    await applyJobStageTransition({
      access: supervisorAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { transition: 'complete' },
      stage: 'procurement',
    });

    const auditCountBeforeDenied = (await context.db.select().from(auditEvents)).length;
    const eventCountBeforeDenied = (await context.db.select().from(jobEvents)).length;

    await expect(
      applyJobStageTransition({
        access: supervisorAccess,
        actorUserId,
        db: context.db,
        id: created.id,
        intent: { transition: 'complete' },
        stage: 'procurement',
      }),
    ).rejects.toMatchObject({
      message: 'Stage is already complete.',
    });

    expect(await context.db.select().from(auditEvents)).toHaveLength(auditCountBeforeDenied);
    expect(await context.db.select().from(jobEvents)).toHaveLength(eventCountBeforeDenied);
  });

  test('completes the job lifecycle and writes both workflow events when dispatch completes', async ({ context }) => {
    const created = await createTestJob(context);

    for (const stage of pipelineStages) {
      await applyJobStageTransition({
        access: supervisorAccess,
        actorUserId,
        db: context.db,
        id: created.id,
        intent: { transition: 'start' },
        stage,
      });
      await applyJobStageTransition({
        access: supervisorAccess,
        actorUserId,
        db: context.db,
        id: created.id,
        intent: { transition: 'complete' },
        stage,
      });
    }

    const [jobRow] = await context.db.select().from(jobs).where(eq(jobs.id, created.id));
    expect(jobRow?.lifecycleStatus).toBe('complete');

    const workflowRows = await context.db.select().from(jobEvents).orderBy(jobEvents.occurredAt);
    expect(workflowRows.at(-2)?.eventType).toBe('stage.completed');
    expect(workflowRows.at(-1)).toMatchObject({
      eventType: 'job.completed',
      jobId: created.id,
      payload: {
        fromLifecycleStatus: 'active',
        toLifecycleStatus: 'complete',
      },
      stageId: null,
    });
  });

  test('returns stage-scoped aggregate visibility after a transition', async ({ context }) => {
    const created = await createTestJob(context);
    const paintAccess = createAccess('job-stage-editor', ['paint']);

    for (const stage of ['procurement', 'fabrication', 'assembly'] as const) {
      await applyJobStageTransition({
        access: supervisorAccess,
        actorUserId,
        db: context.db,
        id: created.id,
        intent: { transition: 'start' },
        stage,
      });
      await applyJobStageTransition({
        access: supervisorAccess,
        actorUserId,
        db: context.db,
        id: created.id,
        intent: { transition: 'complete' },
        stage,
      });
    }

    const result = await applyJobStageTransition({
      access: paintAccess,
      actorUserId,
      db: context.db,
      id: created.id,
      intent: { transition: 'start' },
      stage: 'paint',
    });

    expect(result.stages.find((stage) => stage.stage === 'procurement')).toMatchObject({
      access: 'summary',
      status: 'complete',
    });
    expect(getVisibleStage(result, 'paint').transitionAvailability?.['set-status']).toEqual({
      allowed: true,
      reason: null,
    });
    expect(result.workflowEvents.map((event) => event.eventType)).toEqual(['stage.started']);
  });
});

async function createTestJob({ db, product }: TestContext) {
  return createJob({
    access: supervisorAccess,
    actorUserId,
    db,
    input: {
      productId: product.id,
    },
  });
}

async function createProduct(db: Db) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      modelCode: 'JOB-PIPELINE-TEST-PRODUCT',
      name: 'Job Pipeline Test Product',
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
    id: actorUserId,
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}

function createAccess(role: Parameters<typeof createUserAccessSummary>[0]['role'], departments: Department[]) {
  return createUserAccessSummary({
    departments,
    role,
    userId: actorUserId,
  });
}

function getVisibleStage(job: JobDetail, stage: Department) {
  const jobStage = job.stages.find((item) => item.stage === stage);

  if (!jobStage || jobStage.access !== 'visible') {
    throw new Error(`Expected visible ${stage} stage`);
  }

  return jobStage;
}
