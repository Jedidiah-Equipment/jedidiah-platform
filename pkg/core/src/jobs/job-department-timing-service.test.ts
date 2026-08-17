import {
  type Db,
  jobBayOperatorAssignments,
  jobBays,
  jobDepartmentCrew,
  jobDepartmentTimings,
  jobSlots,
  jobs,
  products,
  productUnits,
  user,
} from '@pkg/db';
import { DateIso } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { getProductBuildMetrics } from '../products/product-build-metrics-service.js';
import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import {
  completeDepartmentTiming,
  startDepartmentTiming,
  updateDepartmentTiming,
} from './job-department-timing-service.js';
import { getJob } from './job-read-service.js';

const actorUserId = 'timing-actor-user-id';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-05T09:00:00.000+02:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

const test = createTester(async ({ db }) => {
  await createUser(db, { id: actorUserId, name: 'Test Actor', role: 'admin' });
  await createUser(db, { id: 'operator-smith', name: 'J. Smith', role: 'bay-operator' });
  await createUser(db, { id: 'operator-brown', name: 'T. Brown', role: 'bay-operator' });
  const productId = await createProduct(db);
  const bayId = await createFabricationBay(db);
  const job = await createBuildJob(db, { productId, serial: 'TIM-0001' });

  return { bayId, db, job, productId };
});

describe('startDepartmentTiming', () => {
  test('records the start stamp and nothing else', async ({ context }) => {
    await startDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { department: 'fabrication', id: context.job.id },
    });

    const detail = await getJob({ db: context.db, id: context.job.id });
    const fabrication = detail.departmentTimings.find((timing) => timing.department === 'fabrication');

    expect(fabrication).toMatchObject({ completedAt: null, crew: [] });
    expect(fabrication?.startedAt).not.toBeNull();
  });

  test('refuses a second start on the same department', async ({ context }) => {
    await startDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { department: 'fabrication', id: context.job.id },
    });

    await expect(
      startDepartmentTiming({ actorUserId, db: context.db, input: { department: 'fabrication', id: context.job.id } }),
    ).rejects.toMatchObject({ code: 'job.department_timing_already_started' });
  });

  test('refuses a completed Job', async ({ context }) => {
    await context.db.update(jobs).set({ completedOn: '2026-06-04' }).where(eq(jobs.id, context.job.id));

    await expect(
      startDepartmentTiming({ actorUserId, db: context.db, input: { department: 'fabrication', id: context.job.id } }),
    ).rejects.toMatchObject({ code: 'job.department_timing_locked' });
  });

  test('refuses a cancelled Job', async ({ context }) => {
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, context.job.id));

    await expect(
      startDepartmentTiming({ actorUserId, db: context.db, input: { department: 'fabrication', id: context.job.id } }),
    ).rejects.toMatchObject({ code: 'job.cancelled' });
  });
});

describe('completeDepartmentTiming', () => {
  test('stamps done and records the crew', async ({ context }) => {
    await startDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { department: 'fabrication', id: context.job.id },
    });
    await completeDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { crewUserIds: ['operator-smith', 'operator-brown'], department: 'fabrication', id: context.job.id },
    });

    const detail = await getJob({ db: context.db, id: context.job.id });
    const fabrication = detail.departmentTimings.find((timing) => timing.department === 'fabrication');

    expect(fabrication?.completedAt).not.toBeNull();
    expect(fabrication?.crew).toEqual([
      { name: 'J. Smith', userId: 'operator-smith' },
      { name: 'T. Brown', userId: 'operator-brown' },
    ]);
  });

  test('refuses a department that was never started', async ({ context }) => {
    await expect(
      completeDepartmentTiming({
        actorUserId,
        db: context.db,
        input: { crewUserIds: ['operator-smith'], department: 'fabrication', id: context.job.id },
      }),
    ).rejects.toMatchObject({ code: 'job.department_timing_not_started' });
  });

  test('refuses crew who are not Bay Operators', async ({ context }) => {
    await startDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { department: 'fabrication', id: context.job.id },
    });

    await expect(
      completeDepartmentTiming({
        actorUserId,
        db: context.db,
        input: { crewUserIds: [actorUserId], department: 'fabrication', id: context.job.id },
      }),
    ).rejects.toMatchObject({ code: 'job.bay_operator_role_denied' });
  });
});

describe('updateDepartmentTiming', () => {
  test('clears a mistaken stamp and its crew when the start time goes', async ({ context }) => {
    await startDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { department: 'fabrication', id: context.job.id },
    });
    await completeDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { crewUserIds: ['operator-smith'], department: 'fabrication', id: context.job.id },
    });

    await updateDepartmentTiming({
      actorUserId,
      db: context.db,
      input: {
        completedAt: null,
        crewUserIds: [],
        department: 'fabrication',
        id: context.job.id,
        startedAt: null,
      },
    });

    const detail = await getJob({ db: context.db, id: context.job.id });

    expect(detail.departmentTimings.find((timing) => timing.department === 'fabrication')).toMatchObject({
      completedAt: null,
      crew: [],
      startedAt: null,
    });
    await expect(
      context.db.select().from(jobDepartmentCrew).where(eq(jobDepartmentCrew.jobId, context.job.id)),
    ).resolves.toEqual([]);
  });

  test('refuses a stamp in the future', async ({ context }) => {
    await expect(
      updateDepartmentTiming({
        actorUserId,
        db: context.db,
        input: {
          completedAt: null,
          crewUserIds: [],
          department: 'fabrication',
          id: context.job.id,
          startedAt: DateIso.parse('2026-06-09T09:00:00.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'job.department_timing_invalid' });
  });

  test('refuses a done stamp with no crew', async ({ context }) => {
    await expect(
      updateDepartmentTiming({
        actorUserId,
        db: context.db,
        input: {
          completedAt: DateIso.parse('2026-06-04T09:00:00.000Z'),
          crewUserIds: [],
          department: 'fabrication',
          id: context.job.id,
          startedAt: DateIso.parse('2026-06-01T09:00:00.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'job.department_timing_invalid' });
  });

  test('refuses a done stamp before its start stamp', async ({ context }) => {
    await expect(
      updateDepartmentTiming({
        actorUserId,
        db: context.db,
        input: {
          completedAt: DateIso.parse('2026-06-01T09:00:00.000Z'),
          crewUserIds: ['operator-smith'],
          department: 'fabrication',
          id: context.job.id,
          startedAt: DateIso.parse('2026-06-04T09:00:00.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'job.department_timing_invalid' });
  });

  test('corrects both stamps and replaces the crew', async ({ context }) => {
    await startDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { department: 'fabrication', id: context.job.id },
    });
    await completeDepartmentTiming({
      actorUserId,
      db: context.db,
      input: { crewUserIds: ['operator-smith'], department: 'fabrication', id: context.job.id },
    });

    await updateDepartmentTiming({
      actorUserId,
      db: context.db,
      input: {
        completedAt: DateIso.parse('2026-06-04T14:00:00.000Z'),
        crewUserIds: ['operator-brown'],
        department: 'fabrication',
        id: context.job.id,
        startedAt: DateIso.parse('2026-06-01T06:00:00.000Z'),
      },
    });

    const detail = await getJob({ db: context.db, id: context.job.id });

    expect(detail.departmentTimings.find((timing) => timing.department === 'fabrication')).toMatchObject({
      completedAt: DateIso.parse('2026-06-04T14:00:00.000Z'),
      crew: [{ name: 'T. Brown', userId: 'operator-brown' }],
      startedAt: DateIso.parse('2026-06-01T06:00:00.000Z'),
    });
  });

  test('refuses any correction once the Job is completed', async ({ context }) => {
    await context.db.update(jobs).set({ completedOn: '2026-06-04' }).where(eq(jobs.id, context.job.id));

    await expect(
      updateDepartmentTiming({
        actorUserId,
        db: context.db,
        input: {
          completedAt: null,
          crewUserIds: [],
          department: 'fabrication',
          id: context.job.id,
          startedAt: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'job.department_timing_locked' });
  });
});

describe('getJob departmentTimings', () => {
  test("offers each department Bay's current operator as the crew prefill", async ({ context }) => {
    await context.db.insert(jobSlots).values({
      bayId: context.bayId,
      durationDays: 4,
      jobId: context.job.id,
      kind: 'work',
      sequence: 1,
    });
    await context.db.insert(jobBayOperatorAssignments).values({
      bayId: context.bayId,
      operatorUserId: 'operator-smith',
    });

    const detail = await getJob({ db: context.db, id: context.job.id });

    expect(detail.departmentTimings.map((timing) => timing.department)).toEqual([
      'fabrication',
      'paint',
      'assembly',
      'workshop',
    ]);
    expect(detail.departmentTimings.find((timing) => timing.department === 'fabrication')?.suggestedCrew).toEqual([
      { name: 'J. Smith', userId: 'operator-smith' },
    ]);
    expect(detail.departmentTimings.find((timing) => timing.department === 'paint')?.suggestedCrew).toEqual([]);
  });
});

describe('getProductBuildMetrics', () => {
  test('starts empty for a Product with no stamped build', async ({ context }) => {
    await expect(
      getProductBuildMetrics({
        db: context.db,
        includeRanking: true,
        input: { department: 'fabrication', productId: context.productId },
      }),
    ).resolves.toMatchObject({ averageWorkingDays: null, buildCount: 0, builds: [], ranking: [] });
  });

  test('counts the Build Job with both stamps, against its scheduled slot days', async ({ context }) => {
    await context.db.insert(jobSlots).values({
      bayId: context.bayId,
      durationDays: 4,
      jobId: context.job.id,
      kind: 'work',
      sequence: 1,
    });
    await stampFabrication(context.db, context.job.id, '2026-06-01', '2026-06-03', ['operator-smith']);

    const metrics = await getProductBuildMetrics({
      db: context.db,
      includeRanking: true,
      input: { department: 'fabrication', productId: context.productId },
    });

    expect(metrics).toMatchObject({
      averageWorkingDays: 3,
      buildCount: 1,
      builds: [{ actualWorkingDays: 3, crewSize: 1, jobCode: context.job.code, scheduledWorkingDays: 4 }],
    });
  });

  test('ignores a rework Job on the same Unit', async ({ context }) => {
    const rework = await createReworkJob(context.db, context.job.productUnitId);
    await stampFabrication(context.db, rework.id, '2026-06-01', '2026-06-10', ['operator-smith']);
    await stampFabrication(context.db, context.job.id, '2026-06-01', '2026-06-02', ['operator-smith']);

    const metrics = await getProductBuildMetrics({
      db: context.db,
      includeRanking: false,
      input: { department: 'fabrication', productId: context.productId },
    });

    expect(metrics).toMatchObject({ averageWorkingDays: 2, buildCount: 1 });
  });

  test('ignores a build that has started but not finished', async ({ context }) => {
    await context.db
      .insert(jobDepartmentTimings)
      .values({ department: 'fabrication', jobId: context.job.id, startedAt: new Date('2026-06-01T06:00:00.000Z') });

    await expect(
      getProductBuildMetrics({
        db: context.db,
        includeRanking: true,
        input: { department: 'fabrication', productId: context.productId },
      }),
    ).resolves.toMatchObject({ buildCount: 0 });
  });

  test('ignores a cancelled Job', async ({ context }) => {
    await stampFabrication(context.db, context.job.id, '2026-06-01', '2026-06-02', ['operator-smith']);
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, context.job.id));

    await expect(
      getProductBuildMetrics({
        db: context.db,
        includeRanking: true,
        input: { department: 'fabrication', productId: context.productId },
      }),
    ).resolves.toMatchObject({ buildCount: 0 });
  });

  test('credits every crew member the full elapsed time and ranks by their average', async ({ context }) => {
    const second = await createBuildJob(context.db, { productId: context.productId, serial: 'TIM-0002' });
    await stampFabrication(context.db, context.job.id, '2026-06-01', '2026-06-02', [
      'operator-smith',
      'operator-brown',
    ]);
    await stampFabrication(context.db, second.id, '2026-06-01', '2026-06-05', ['operator-brown']);

    const metrics = await getProductBuildMetrics({
      db: context.db,
      includeRanking: true,
      input: { department: 'fabrication', productId: context.productId },
    });

    expect(metrics.ranking).toEqual([
      { averageCrewSize: 2, averageWorkingDays: 2, buildCount: 1, name: 'J. Smith', userId: 'operator-smith' },
      { averageCrewSize: 1.5, averageWorkingDays: 3.5, buildCount: 2, name: 'T. Brown', userId: 'operator-brown' },
    ]);
  });
});

async function stampFabrication(
  db: Db,
  jobId: string,
  startedOn: string,
  completedOn: string,
  crewUserIds: string[],
): Promise<void> {
  await db.insert(jobDepartmentTimings).values({
    completedAt: new Date(`${completedOn}T14:00:00.000Z`),
    department: 'fabrication',
    jobId,
    startedAt: new Date(`${startedOn}T06:00:00.000Z`),
  });
  await db
    .insert(jobDepartmentCrew)
    .values(crewUserIds.map((crewUserId) => ({ crewUserId, department: 'fabrication' as const, jobId })));
}

async function createUser(
  db: Db,
  { id, name, role }: { id: string; name: string; role: 'admin' | 'bay-operator' },
): Promise<void> {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    name,
    role,
    updatedAt: now,
  });
}

async function createProduct(db: Db): Promise<string> {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 10,
      currencyCode: 'ZAR',
      modelCode: 'TIM-001',
      name: 'Timing Test Product',
      rangeId,
    })
    .returning();

  if (!product) throw new Error('Product insert did not return a row');

  return product.id;
}

async function createFabricationBay(db: Db): Promise<string> {
  const [bay] = await db
    .insert(jobBays)
    .values({ department: 'fabrication', name: 'Fabrication Bay 1', scheduleOrigin: '2026-06-01' })
    .returning();

  if (!bay) throw new Error('Bay insert did not return a row');

  return bay.id;
}

async function createBuildJob(db: Db, { productId, serial }: { productId: string; serial: string }) {
  const [unit] = await db
    .insert(productUnits)
    .values({
      productId,
      productSerialNumber: serial,
      productSerialPrefix: 'TIM',
      productSerialSequence: 1,
      productSerialYear: 26,
    })
    .returning();

  if (!unit) throw new Error('Product unit insert did not return a row');

  const [job] = await db
    .insert(jobs)
    .values({ createdAt: new Date('2026-05-01T06:00:00.000Z'), productUnitId: unit.id })
    .returning();

  if (!job) throw new Error('Job insert did not return a row');

  return job;
}

/** A later live Job on the same Unit, which the Build Job predicate must skip. */
async function createReworkJob(db: Db, productUnitId: string | null) {
  if (!productUnitId) throw new Error('Expected a Unit-bound Job');

  const [job] = await db
    .insert(jobs)
    .values({ createdAt: new Date('2026-05-20T06:00:00.000Z'), productUnitId })
    .returning();

  if (!job) throw new Error('Job insert did not return a row');

  return job;
}
