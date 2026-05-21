import { auditEvents, type Db, jobEvents, jobStageStations, products, stations } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { AppRole, Department, JobDetail, JobLifecycleStatus, JobStageName } from '@pkg/schema';
import pino from 'pino';
import { describe, expect } from 'vitest';

import { createActorUser } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(async ({ databaseClient, db }) => {
  await createActorUser(db, 'job-supervisor');
  const product = await createProduct(db);

  return { databaseClient, db, product };
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

  test('creates stage dates and station bookings from the reviewed create payload', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const [station] = await context.db
      .insert(stations)
      .values({
        department: 'fabrication',
        displayOrder: 1,
        name: 'Weld Bay 1',
      })
      .returning();

    if (!station) {
      throw new Error('Station insert did not return a row');
    }

    const job = await caller.jobs.create({
      dueEnd: '2026-08-10',
      dueStart: '2026-08-01',
      productId: context.product.id,
      stages: [
        createStageInput('procurement', '2026-08-01', '2026-08-02'),
        createStageInput('supply', '2026-08-02', '2026-08-03'),
        createStageInput('fabrication', '2026-08-03', '2026-08-07', station.id),
        createStageInput('paint', '2026-08-07', '2026-08-08'),
        createStageInput('assembly', '2026-08-08', '2026-08-10'),
      ],
    });

    expect(job).toMatchObject({
      dueEnd: '2026-08-10',
      dueStart: '2026-08-01',
      dueEndSetManually: true,
      dueStartSetManually: true,
    });
    expect(job.stages.find((stage) => stage.stage === 'fabrication')).toMatchObject({
      dueEnd: '2026-08-07',
      dueEndSetManually: true,
      dueStart: '2026-08-03',
      dueStartSetManually: false,
      stations: [
        {
          dueEnd: '2026-08-07',
          dueEndSetManually: false,
          dueStart: '2026-08-04',
          dueStartSetManually: true,
          stationId: station.id,
        },
      ],
    });

    const stationRows = await context.db.select().from(jobStageStations);
    expect(stationRows).toHaveLength(1);
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

  test('refuses stage writes while a job is paused or cancelled', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const pausedJob = await caller.jobs.pause({ id: (await caller.jobs.create({ productId: context.product.id })).id });
    const cancelledJob = await caller.jobs.cancel({
      id: (await caller.jobs.create({ productId: context.product.id })).id,
    });

    await expect(caller.jobs.startStage({ id: pausedJob.id, stage: 'procurement' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Job is paused.',
    });
    await expect(caller.jobs.startStage({ id: cancelledJob.id, stage: 'procurement' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Job is cancelled.',
    });
  });
});

describe('jobs station booking transitions', () => {
  test('first start cascades actual starts to stage and job with paired events and audits', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await createJobWithStationBookings({
      caller,
      db: context.db,
      productId: context.product.id,
      stages: ['fabrication'],
    });
    const booking = getStageBooking(job, 'fabrication');

    const updated = await caller.jobs.startStationBooking({ id: booking.id });
    const updatedStage = updated.stages.find((stage) => stage.stage === 'fabrication');

    expect(updated.lifecycleStatus).toBe('active');
    expect(updated.actualStart).toEqual(expect.any(String));
    expect(updatedStage).toMatchObject({
      actualEnd: null,
      state: 'in-progress',
    });
    expect(updatedStage?.actualStart).toEqual(expect.any(String));
    expect(updatedStage?.stations[0]).toMatchObject({
      state: 'in-progress',
    });

    const workflowEvents = await listJobEventTypes(context.db, job.id);
    expect(workflowEvents.sort()).toEqual(['job.started', 'stage.started', 'station.started']);

    const auditRows = (await context.db.select().from(auditEvents)).filter((event) => event.action === 'updated');
    expect(auditRows.map((event) => event.entityType).sort()).toEqual(['job', 'job_stage', 'job_stage_station']);
  });

  test('last stop cascades actual ends to stage and job', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    let job = await createJobWithStationBookings({
      caller,
      db: context.db,
      productId: context.product.id,
      stages: ['procurement', 'supply', 'fabrication', 'paint', 'assembly'],
    });

    for (const stage of ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const) {
      job = await caller.jobs.startStationBooking({ id: getStageBooking(job, stage).id });
    }

    for (const stage of ['procurement', 'supply', 'fabrication', 'paint'] as const) {
      job = await caller.jobs.stopStationBooking({ id: getStageBooking(job, stage).id });
      expect(job.lifecycleStatus).toBe('active');
    }

    const completed = await caller.jobs.stopStationBooking({ id: getStageBooking(job, 'assembly').id });

    expect(completed.lifecycleStatus).toBe('complete');
    expect(completed.actualEnd).toEqual(expect.any(String));
    expect(completed.stages.every((stage) => stage.actualEnd)).toBe(true);

    const workflowEvents = await listJobEventTypes(context.db, job.id);
    expect(workflowEvents.filter((eventType) => eventType === 'station.ended')).toHaveLength(5);
    expect(workflowEvents.filter((eventType) => eventType === 'stage.ended')).toHaveLength(5);
    expect(workflowEvents.filter((eventType) => eventType === 'job.completed')).toHaveLength(1);
  });

  test('refuses restart after a booking has ended and emits no events', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    let job = await createJobWithStationBookings({
      caller,
      db: context.db,
      productId: context.product.id,
      stages: ['fabrication'],
    });
    const booking = getStageBooking(job, 'fabrication');

    job = await caller.jobs.startStationBooking({ id: booking.id });
    await caller.jobs.stopStationBooking({ id: getStageBooking(job, 'fabrication').id });
    const beforeEvents = await listJobEventTypes(context.db, job.id);

    await expect(caller.jobs.startStationBooking({ id: booking.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Station booking has already ended.',
    });

    await expect(listJobEventTypes(context.db, job.id)).resolves.toEqual(beforeEvents);
  });

  test('refuses station booking starts after the parent stage is complete', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    let job = await createJobWithStationBookings({
      caller,
      db: context.db,
      productId: context.product.id,
      stages: ['procurement'],
    });

    job = await caller.jobs.startStage({ id: job.id, stage: 'procurement' });
    await caller.jobs.completeStage({ id: job.id, stage: 'procurement' });
    const beforeEvents = await listJobEventTypes(context.db, job.id);

    await expect(caller.jobs.startStationBooking({ id: getStageBooking(job, 'procurement').id })).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
        message: 'Stage is already complete.',
      },
    );
    await expect(listJobEventTypes(context.db, job.id)).resolves.toEqual(beforeEvents);
  });

  test('refuses station booking starts after the job is complete', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    let job = await createJobWithStationBookings({
      caller,
      db: context.db,
      productId: context.product.id,
      stages: ['fabrication'],
    });

    for (const stage of ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const) {
      job = await caller.jobs.startStage({ id: job.id, stage });
      job = await caller.jobs.completeStage({ id: job.id, stage });
    }
    const beforeEvents = await listJobEventTypes(context.db, job.id);

    await expect(caller.jobs.startStationBooking({ id: getStageBooking(job, 'fabrication').id })).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
        message: 'Job is already complete.',
      },
    );
    await expect(listJobEventTypes(context.db, job.id)).resolves.toEqual(beforeEvents);
  });

  test('refuses station booking writes while a job is paused and emits no events', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await createJobWithStationBookings({
      caller,
      db: context.db,
      productId: context.product.id,
      stages: ['fabrication'],
    });
    const paused = await caller.jobs.pause({ id: job.id });
    const booking = getStageBooking(paused, 'fabrication');

    await expect(caller.jobs.startStationBooking({ id: booking.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Job is paused.',
    });
    await expect(listJobEventTypes(context.db, job.id)).resolves.toEqual(['job.paused']);
  });

  test('refuses station booking writes while a job is cancelled and emits no events', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await createJobWithStationBookings({
      caller,
      db: context.db,
      productId: context.product.id,
      stages: ['fabrication'],
    });
    const cancelled = await caller.jobs.cancel({ id: job.id });
    const booking = getStageBooking(cancelled, 'fabrication');

    await expect(caller.jobs.startStationBooking({ id: booking.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Job is cancelled.',
    });
    await expect(listJobEventTypes(context.db, job.id)).resolves.toEqual(['job.cancelled']);
  });

  test('keeps sticky parent actual dates pinned during cascade', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await createJobWithStationBookings({
      caller,
      db: context.db,
      productId: context.product.id,
      stages: ['fabrication'],
    });
    const stickyStart = new Date('2026-05-01T08:00:00.000Z');
    await context.databaseClient.queryClient`
      update job_stage
      set actual_start = ${stickyStart.toISOString()}, actual_start_set_manually = true
      where id = ${getStage(job, 'fabrication').id}
    `;

    const updated = await caller.jobs.startStationBooking({ id: getStageBooking(job, 'fabrication').id });
    const updatedStage = getStage(updated, 'fabrication');

    expect(updatedStage.actualStart).toBe(stickyStart.toISOString());
  });

  test('scopes department manager booking writes to the booking station department', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const job = await createJobWithStationBookings({
      caller: supervisorCaller,
      db: context.db,
      productId: context.product.id,
      stages: ['fabrication'],
    });
    const paintCaller = createScopedCaller(context.db, 'job-department-manager', ['paint']);

    await expect(
      paintCaller.jobs.startStationBooking({ id: getStageBooking(job, 'fabrication').id }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You do not have access to update this station booking.',
    });

    const fabricationCaller = createScopedCaller(context.db, 'job-department-manager', ['fabrication']);
    await expect(
      fabricationCaller.jobs.startStationBooking({ id: getStageBooking(job, 'fabrication').id }),
    ).resolves.toMatchObject({
      lifecycleStatus: 'active',
    });
  });
});

describe('jobs lifecycle toggles', () => {
  test('pauses, resumes, cancels, and uncancels with paired workflow and audit events', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await caller.jobs.create({ productId: context.product.id });
    const initialStages = job.stages;

    const paused = await caller.jobs.pause({ id: job.id });
    expect(paused).toMatchObject({ isCancelled: false, isPaused: true, lifecycleStatus: 'paused' });

    const resumed = await caller.jobs.resume({ id: job.id });
    expect(resumed).toMatchObject({ isCancelled: false, isPaused: false, lifecycleStatus: 'not-started' });

    const cancelled = await caller.jobs.cancel({ id: job.id });
    expect(cancelled).toMatchObject({ isCancelled: true, isPaused: false, lifecycleStatus: 'cancelled' });

    const uncancelled = await caller.jobs.uncancel({ id: job.id });
    expect(uncancelled).toMatchObject({ isCancelled: false, isPaused: false, lifecycleStatus: 'not-started' });
    expect(uncancelled.stages).toEqual(initialStages);

    const workflowEvents = (await context.db.select().from(jobEvents)).filter((event) => event.jobId === job.id);
    expect(workflowEvents.map((event) => event.eventType).sort()).toEqual([
      'job.cancelled',
      'job.paused',
      'job.resumed',
      'job.uncancelled',
    ]);

    const auditRows = (await context.db.select().from(auditEvents)).filter((event) => event.entityId === job.id);
    expect(auditRows.filter((event) => event.action === 'updated')).toHaveLength(4);
  });

  test('restores date-derived status when uncancelling a started job', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const activeJob = await createActiveJob(caller, context.product.id);

    const cancelled = await caller.jobs.cancel({ id: activeJob.id });
    expect(cancelled.lifecycleStatus).toBe('cancelled');

    const uncancelled = await caller.jobs.uncancel({ id: activeJob.id });
    expect(uncancelled).toMatchObject({
      isCancelled: false,
      isPaused: false,
      lifecycleStatus: 'active',
    });
  });

  test('keeps flag precedence explicit for completed jobs', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const completeJob = await createCompleteJob(caller, context.product.id);
    expect(completeJob.lifecycleStatus).toBe('complete');

    const paused = await caller.jobs.pause({ id: completeJob.id });
    expect(paused.lifecycleStatus).toBe('paused');

    const resumed = await caller.jobs.resume({ id: completeJob.id });
    expect(resumed.lifecycleStatus).toBe('complete');

    const cancelled = await caller.jobs.cancel({ id: completeJob.id });
    expect(cancelled.lifecycleStatus).toBe('cancelled');

    const uncancelled = await caller.jobs.uncancel({ id: completeJob.id });
    expect(uncancelled.lifecycleStatus).toBe('complete');
  });

  test('blocks pause and resume while a job is cancelled', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const pausedJob = await caller.jobs.pause({ id: (await createActiveJob(caller, context.product.id)).id });
    const cancelledPausedJob = await caller.jobs.cancel({ id: pausedJob.id });

    await expect(caller.jobs.resume({ id: cancelledPausedJob.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Cancelled jobs cannot be paused or resumed.',
    });
    await expect(caller.jobs.pause({ id: cancelledPausedJob.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Cancelled jobs cannot be paused or resumed.',
    });

    const uncancelled = await caller.jobs.uncancel({ id: cancelledPausedJob.id });
    expect(uncancelled.lifecycleStatus).toBe('paused');

    const resumed = await caller.jobs.resume({ id: cancelledPausedJob.id });
    expect(resumed.lifecycleStatus).toBe('active');
  });

  test('limits lifecycle toggles to roles with job update access', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const departmentCaller = context.createCaller(mockSession('job-department-manager'));
    const job = await supervisorCaller.jobs.create({ productId: context.product.id });

    await expect(departmentCaller.jobs.pause({ id: job.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

async function createActiveJob(caller: AppRouterCaller, productId: string) {
  const job = await caller.jobs.create({ productId });

  return caller.jobs.startStage({ id: job.id, stage: 'procurement' });
}

function createScopedCaller(db: Db, role: AppRole, departments: Department[]): AppRouterCaller {
  return createAppRouterCaller({
    access: createUserAccessSummary({
      departments,
      role,
      userId: 'test-user-id',
    }),
    db,
    log: pino({ level: 'silent' }),
    session: mockSession(role),
  });
}

async function createJobWithStationBookings({
  caller,
  db,
  productId,
  stages,
}: {
  caller: AppRouterCaller;
  db: Db;
  productId: string;
  stages: readonly JobStageName[];
}): Promise<JobDetail> {
  const stationRows = await db
    .insert(stations)
    .values(
      stages.map((stage, index) => ({
        department: stage,
        displayOrder: index + 1,
        name: `${stage} Station ${index + 1}`,
      })),
    )
    .returning();
  const stationByStage = new Map(stationRows.map((station) => [station.department, station]));

  return caller.jobs.create({
    productId,
    stages: (['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const).map((stage) => {
      const station = stationByStage.get(stage);

      return createStageInput(stage, '2026-08-01', '2026-08-02', station?.id);
    }),
  });
}

function getStage(job: JobDetail, stageName: JobStageName) {
  const stage = job.stages.find((item) => item.stage === stageName);

  if (!stage) {
    throw new Error(`Missing ${stageName} stage`);
  }

  return stage;
}

function getStageBooking(job: JobDetail, stageName: JobStageName) {
  const [booking] = getStage(job, stageName).stations;

  if (!booking) {
    throw new Error(`Missing ${stageName} station booking`);
  }

  return booking;
}

async function listJobEventTypes(db: Db, jobId: string) {
  const rows = (await db.select().from(jobEvents)).filter((event) => event.jobId === jobId);

  return rows.map((event) => event.eventType).sort();
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

function createStageInput(stage: JobCreateStageName, dueStart: string, dueEnd: string, stationId?: string) {
  return {
    dueEnd,
    dueEndSetManually: stage === 'fabrication',
    dueStart,
    dueStartSetManually: false,
    stage,
    stationBookings: stationId
      ? [
          {
            dueEnd,
            dueEndSetManually: false,
            dueStart: '2026-08-04',
            dueStartSetManually: true,
            stationId,
          },
        ]
      : [],
  };
}

type JobCreateStageName = 'procurement' | 'supply' | 'fabrication' | 'paint' | 'assembly';

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
