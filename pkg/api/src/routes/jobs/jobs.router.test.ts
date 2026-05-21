import { type Db, products } from '@pkg/db';
import type { JobLifecycleStatus } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createActorUser } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'job-supervisor');
  const product = await createProduct(db);

  return { db, product };
});

describe('jobs.create', () => {
  test('creates a job with the station-overhaul stage model', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));

    const job = await caller.jobs.create({
      dueEnd: '2026-08-15',
      productId: context.product.id,
    });

    expect(job).toMatchObject({
      dueEnd: '2026-08-15',
      dueEndSetManually: true,
      dueStart: null,
      dueStartSetManually: false,
      lifecycleStatus: 'not-started',
    });
    expect(job.stages.map((stage) => stage.stage)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
    expect(job.stages.map((stage) => stage.state)).toEqual(['pending', 'pending', 'pending', 'pending', 'pending']);
    expect(job.stages.every((stage) => stage.stations.length === 0)).toBe(true);
    expect('dueDate' in job).toBe(false);
  });
});

describe('jobs.list', () => {
  test('filters by each derived lifecycle status', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const jobsByStatus = {
      active: await createActiveJob(caller, context.product.id),
      cancelled: await createCancelledJob(caller, context.product.id),
      complete: await createCompleteJob(caller, context.product.id),
      'not-started': await caller.jobs.create({ productId: context.product.id }),
      paused: await createPausedJob(caller, context.product.id),
    } satisfies Record<JobLifecycleStatus, { id: string }>;

    for (const [status, job] of Object.entries(jobsByStatus) as [JobLifecycleStatus, { id: string }][]) {
      const result = await caller.jobs.list({
        filters: { lifecycleStatuses: [status] },
        page: 1,
        pageSize: 20,
      });

      expect(result.items.map((item) => item.id)).toContain(job.id);
      expect(result.items.every((item) => item.lifecycleStatus === status)).toBe(true);
    }
  });
});

describe('jobs stage transitions', () => {
  test('starts and completes stages through actual dates', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await caller.jobs.create({ productId: context.product.id });

    const started = await caller.jobs.startStage({ id: job.id, stage: 'procurement' });
    const startedStage = started.stages.find((stage) => stage.stage === 'procurement');

    expect(started.lifecycleStatus).toBe('active');
    expect(startedStage).toMatchObject({
      actualEnd: null,
      state: 'in-progress',
    });
    expect(startedStage?.actualStart).toEqual(expect.any(String));

    const completed = await caller.jobs.completeStage({ id: job.id, stage: 'procurement' });
    const completedStage = completed.stages.find((stage) => stage.stage === 'procurement');

    expect(completed.lifecycleStatus).toBe('active');
    expect(completedStage).toMatchObject({
      state: 'complete',
    });
    expect(completedStage?.actualEnd).toEqual(expect.any(String));
    expect(completed.workflowEvents.map((event) => event.eventType)).toEqual(['stage.stopped', 'stage.started']);
  });
});

async function createActiveJob(caller: AppRouterCaller, productId: string) {
  const job = await caller.jobs.create({ productId });

  return caller.jobs.startStage({ id: job.id, stage: 'procurement' });
}

async function createCancelledJob(caller: AppRouterCaller, productId: string) {
  const activeJob = await createActiveJob(caller, productId);

  return caller.jobs.cancel({ id: activeJob.id });
}

async function createCompleteJob(caller: AppRouterCaller, productId: string) {
  let job = await caller.jobs.create({ productId });

  for (const stage of ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const) {
    job = await caller.jobs.startStage({ id: job.id, stage });
    job = await caller.jobs.completeStage({ id: job.id, stage });
  }

  return job;
}

async function createPausedJob(caller: AppRouterCaller, productId: string) {
  const activeJob = await createActiveJob(caller, productId);

  return caller.jobs.pause({ id: activeJob.id });
}

async function createProduct(db: Db): Promise<{ id: string }> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      modelCode: 'JOB-ROUTER-001',
      name: 'Job Router Product',
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return { id: product.id };
}
