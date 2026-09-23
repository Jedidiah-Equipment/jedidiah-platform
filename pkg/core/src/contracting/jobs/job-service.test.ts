import { auditEvents, user } from '@pkg/db';
import { contractingMachineAssignments, contractingMeasures } from '@pkg/db/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { DateOnlyIso } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCustomer } from '../customers/customer-service.js';
import { createFarm } from '../customers/farm-service.js';
import { createCategory } from '../fleet/category-service.js';
import { createImplement, retireImplement } from '../fleet/implement-service.js';
import { createMachine } from '../fleet/machine-service.js';
import { createMeasureType, removeMeasureType } from '../rate-card/measure-type-service.js';
import { createRate, listRates, removeRate } from '../rate-card/rate-service.js';
import { captureReading } from '../readings/reading-service.js';
import { createWorkType } from '../work-types/work-type-service.js';
import { createAssignment, patchAssignment, removeAssignment, resolveGap } from './assignment-service.js';
import { getJob, listJobs } from './job-read.js';
import { cancelJob, completeJob, createJob } from './job-service.js';
import { setMeasure } from './measure-service.js';

const managerId = 'job-manager';
const foremanId = 'job-foreman';
const otherForemanId = 'other-foreman';
const driverId = 'job-driver';
const deviceDriverId = 'job-driver-device';
const manager = accessForRole('contracting-manager', managerId);
const foreman = accessForRole('foreman', foremanId);

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values([
    {
      id: managerId,
      name: 'Henk',
      email: 'henk-jobs@example.com',
      emailVerified: true,
      contractingRole: 'contracting-manager',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: foremanId,
      name: 'Sipho',
      email: 'sipho-jobs@example.com',
      emailVerified: true,
      contractingRole: 'foreman',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: otherForemanId,
      name: 'Other',
      email: 'other-jobs@example.com',
      emailVerified: true,
      contractingRole: 'foreman',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: driverId,
      name: 'Driver',
      email: 'driver-jobs@example.com',
      emailVerified: true,
      contractingRole: 'driver',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: deviceDriverId,
      name: 'Driver tablet',
      email: 'driver-device-jobs@example.com',
      emailVerified: true,
      contractingRole: 'driver',
      isDevice: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const customer = await createCustomer({ db, actorUserId: managerId, input: { name: 'Rowley' } });
  const farm = await createFarm({
    db,
    actorUserId: managerId,
    input: { customerId: customer.id, name: 'Rooikraal' },
  });
  const otherCustomer = await createCustomer({ db, actorUserId: managerId, input: { name: 'Steyn' } });
  const otherFarm = await createFarm({
    db,
    actorUserId: managerId,
    input: { customerId: otherCustomer.id, name: 'Klipdrift' },
  });
  const workType = await createWorkType({ db, actorUserId: managerId, input: { name: 'Dam building' } });
  const category = await createCategory({
    db,
    actorUserId: managerId,
    input: { name: 'Excavators', kind: 'machine' },
  });
  const machine = await createMachine({
    db,
    actorUserId: managerId,
    input: {
      code: 'CAT320-1',
      make: 'CAT',
      model: '320',
      categoryId: category.id,
      year: null,
      registration: null,
      currentDriverUserId: driverId,
      notes: null,
      serviceIntervalHours: null,
      nextServiceDueHours: null,
    },
  });
  const implementCategory = await createCategory({
    db,
    actorUserId: managerId,
    input: { name: 'Tip trailers', kind: 'implement' },
  });
  const implement = await createImplement({
    db,
    actorUserId: managerId,
    input: { code: 'TIP-1', categoryId: implementCategory.id, notes: null },
  });
  return { customer, farm, implement, machine, otherCustomer, otherFarm, workType };
});

const jobInput = (context: { customer: { id: string }; farm: { id: string }; workType: { id: string } }) => ({
  customerId: context.customer.id,
  farmId: context.farm.id,
  workTypeId: context.workType.id,
  description: 'Dam',
  foremanUserId: foremanId,
});

describe('Job setup', () => {
  test('issues consecutive Job Numbers and enforces Farm and Foreman references in the database', async ({
    context,
  }) => {
    const first = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const second = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    expect([first.jobNumber, second.jobNumber]).toEqual(['CJOB-00001', 'CJOB-00002']);

    await expect(
      createJob({
        db: context.db,
        actor: manager,
        input: { ...jobInput(context), farmId: context.otherFarm.id },
      }),
    ).rejects.toMatchObject({
      code: 'contracting_job.invalid_reference',
      message: 'Pick a Farm that belongs to this Customer.',
    });
    await expect(
      createJob({
        db: context.db,
        actor: manager,
        input: { ...jobInput(context), foremanUserId: driverId },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.invalid_foreman' });
    await expect(
      context.db.update(user).set({ contractingRole: 'driver' }).where(eq(user.id, foremanId)),
    ).rejects.toBeDefined();
  });
});

describe('Machine Assignment lifecycle', () => {
  test('rejects retired Implements and device Drivers when an arrival starts a stint', async ({ context }) => {
    const job = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const planned = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: job.id, machineId: context.machine.id, implementId: null },
    });
    if (!planned) throw new Error('Expected planned assignment');
    await retireImplement({
      db: context.db,
      actorUserId: managerId,
      input: { id: context.implement.id, reason: 'Sold' },
    });
    await expect(
      captureReading({
        db: context.db,
        actor: foreman,
        input: {
          machineId: context.machine.id,
          assignmentId: planned.id,
          stintOverrides: { implementId: context.implement.id },
          role: 'arrival',
          value: 100,
          capturedAt: '2026-09-01T08:00:00+02:00',
          disputePrevious: false,
        },
      }),
    ).rejects.toMatchObject({
      code: 'reading.invalid_role',
      message: 'The selected Implement is no longer available.',
    });
    await expect(
      captureReading({
        db: context.db,
        actor: foreman,
        input: {
          machineId: context.machine.id,
          role: 'arrival',
          startAssignment: {
            localId: '5f1c2d3e-0001-4a00-8000-000000000090',
            jobId: job.id,
            implementId: null,
            driverUserId: deviceDriverId,
          },
          value: 100,
          capturedAt: '2026-09-01T08:00:00+02:00',
          disputePrevious: false,
        },
      }),
    ).rejects.toMatchObject({
      code: 'reading.invalid_role',
      message: 'Select a person with the Contracting driver role.',
    });
  });

  test('starts an unplanned stint atomically, replays it, and applies planned-stint overrides', async ({ context }) => {
    const firstJob = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const secondJob = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const otherJob = await createJob({
      db: context.db,
      actor: manager,
      input: { ...jobInput(context), foremanUserId: otherForemanId },
    });
    const assignmentId = '5f1c2d3e-0001-4a00-8000-000000000010';
    const readingId = '5f1c2d3e-0001-4a00-8000-000000000011';
    const input = {
      localId: readingId,
      machineId: context.machine.id,
      role: 'arrival' as const,
      startAssignment: { localId: assignmentId, jobId: firstJob.id, implementId: null },
      value: 100,
      capturedAt: '2026-09-01T08:00:00+02:00',
      disputePrevious: false,
    };

    const first = await captureReading({ db: context.db, actor: foreman, input });
    expect((await getJob({ db: context.db, id: firstJob.id })).assignments).toMatchObject([
      { id: assignmentId, driverUserId: driverId, state: 'on-site', arrival: { id: first.id } },
    ]);
    expect((await captureReading({ db: context.db, actor: foreman, input })).id).toBe(first.id);
    expect(await context.db.select().from(contractingMachineAssignments)).toHaveLength(1);

    await expect(
      captureReading({
        db: context.db,
        actor: foreman,
        input: {
          ...input,
          localId: '5f1c2d3e-0001-4a00-8000-000000000012',
          startAssignment: {
            localId: '5f1c2d3e-0001-4a00-8000-000000000013',
            jobId: secondJob.id,
            implementId: null,
          },
          value: 101,
        },
      }),
    ).rejects.toMatchObject({ code: 'reading.machine_on_site' });

    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId,
        role: 'departure',
        value: 110,
        capturedAt: '2026-09-01T17:00:00+02:00',
        disputePrevious: false,
        comment: 'Photo unavailable',
      },
    });
    const planned = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: secondJob.id, machineId: context.machine.id, implementId: null },
    });
    if (!planned) throw new Error('Expected planned assignment');
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: planned.id,
        stintOverrides: { driverUserId: null },
        role: 'arrival',
        value: 111,
        capturedAt: '2026-09-02T08:00:00+02:00',
        disputePrevious: false,
      },
    });
    expect((await getJob({ db: context.db, id: secondJob.id })).assignments[0]).toMatchObject({
      id: planned.id,
      driverUserId: null,
      state: 'on-site',
    });

    await expect(
      captureReading({
        db: context.db,
        actor: foreman,
        input: {
          ...input,
          localId: '5f1c2d3e-0001-4a00-8000-000000000014',
          startAssignment: {
            localId: '5f1c2d3e-0001-4a00-8000-000000000015',
            jobId: otherJob.id,
            implementId: null,
          },
          value: 112,
        },
      }),
    ).rejects.toMatchObject({ code: 'reading.forbidden' });
  });

  test('activates on first arrival, refuses overlapping on-site stints, and allows a repeat stint after departure', async ({
    context,
  }) => {
    const firstJob = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const secondJob = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const first = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: firstJob.id, machineId: context.machine.id, implementId: null },
    });
    const second = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: secondJob.id, machineId: context.machine.id, implementId: null },
    });
    if (!first || !second) throw new Error('Expected assignments');
    expect(
      (await context.db.select().from(auditEvents)).some(
        (event) => event.entityType === 'contracting_assignment' && event.summary.includes('CAT320-1'),
      ),
    ).toBe(true);

    await expect(
      captureReading({
        db: context.db,
        actor: foreman,
        input: {
          machineId: context.machine.id,
          assignmentId: second.id,
          role: 'departure',
          value: 99,
          capturedAt: '2026-09-01T07:00:00+02:00',
          disputePrevious: false,
          comment: 'Management departure',
        },
      }),
    ).rejects.toMatchObject({ code: 'reading.invalid_role' });

    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: first.id,
        role: 'arrival',
        value: 100,
        capturedAt: '2026-09-01T08:00:00+02:00',
        disputePrevious: false,
      },
    });
    expect((await getJob({ db: context.db, id: firstJob.id })).status).toBe('active');
    await expect(
      cancelJob({
        db: context.db,
        actor: manager,
        input: { id: firstJob.id, reason: 'Customer cancelled' },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.has_on_site_stints' });
    await expect(
      captureReading({
        db: context.db,
        actor: foreman,
        input: {
          machineId: context.machine.id,
          assignmentId: second.id,
          role: 'arrival',
          value: 101,
          capturedAt: '2026-09-01T09:00:00+02:00',
          disputePrevious: false,
        },
      }),
    ).rejects.toMatchObject({ code: 'reading.machine_on_site' });
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: first.id,
        role: 'departure',
        value: 110,
        capturedAt: '2026-09-01T17:00:00+02:00',
        disputePrevious: false,
        comment: 'Photo unavailable',
      },
    });
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: second.id,
        role: 'arrival',
        value: 112,
        capturedAt: '2026-09-02T08:00:00+02:00',
        disputePrevious: false,
      },
    });
    expect((await getJob({ db: context.db, id: secondJob.id })).status).toBe('active');
    expect(
      (
        await listJobs({
          db: context.db,
          actor: accessForRole('contracting-admin', 'reader'),
          queue: 'looks-finished',
          limit: 50,
          offset: 0,
        })
      ).map((job) => job.id),
    ).toEqual([firstJob.id]);
    expect(
      await listJobs({
        db: context.db,
        actor: accessForRole('contracting-admin', 'reader'),
        queue: 'active',
        limit: 1,
        offset: 1,
      }),
    ).toHaveLength(1);

    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: second.id,
        role: 'departure',
        value: 111,
        capturedAt: '2026-09-02T17:00:00+02:00',
        disputePrevious: true,
        comment: 'Meter reading needs review',
      },
    });
    expect((await getJob({ db: context.db, id: secondJob.id })).assignments[0]).toMatchObject({
      workHours: null,
      billableHours: null,
    });
  });

  test('freezes assignment changes after cancellation', async ({ context }) => {
    const job = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const planned = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: job.id, machineId: context.machine.id, implementId: null },
    });
    if (!planned) throw new Error('Expected assignment');
    await cancelJob({
      db: context.db,
      actor: manager,
      input: { id: job.id, reason: 'Customer cancelled' },
    });
    await expect(
      patchAssignment({
        db: context.db,
        actor: manager,
        input: { id: planned.id, travelIncluded: false },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
    await expect(removeAssignment({ db: context.db, actor: manager, id: planned.id })).rejects.toMatchObject({
      code: 'contracting_job.wrong_status',
    });
  });
});

describe('Completion and billable facts', () => {
  test('upserts Measures, guards Completion, deletes confirmed planned stints, and locks used rate-card rows', async ({
    context,
  }) => {
    const job = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const arrived = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: job.id, machineId: context.machine.id, implementId: null },
    });
    if (!arrived) throw new Error('Expected assignment');
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: arrived.id,
        role: 'arrival',
        value: 200,
        capturedAt: '2026-09-03T08:00:00+02:00',
        disputePrevious: false,
      },
    });
    await expect(
      completeJob({
        db: context.db,
        actor: manager,
        input: {
          id: job.id,
          startDate: DateOnlyIso.parse('2026-09-03'),
          endDate: DateOnlyIso.parse('2026-09-03'),
          dieselLitres: 0,
          notes: null,
          removePlannedAssignmentIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.has_on_site_stints' });
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: arrived.id,
        role: 'departure',
        value: 210,
        capturedAt: '2026-09-03T17:00:00+02:00',
        disputePrevious: false,
        comment: 'Photo unavailable',
      },
    });
    const measureType = await createMeasureType({ db: context.db, actorUserId: managerId, input: { name: 'Loads' } });
    await setMeasure({
      db: context.db,
      actor: manager,
      input: { assignmentId: arrived.id, measureTypeId: measureType.id, quantity: 18 },
    });
    await setMeasure({
      db: context.db,
      actor: manager,
      input: { assignmentId: arrived.id, measureTypeId: measureType.id, quantity: 20 },
    });
    expect(await context.db.select().from(contractingMeasures)).toHaveLength(1);
    expect(
      (await context.db.select().from(auditEvents)).some(
        (event) => event.entityType === 'contracting_measure' && event.summary.includes('Loads'),
      ),
    ).toBe(true);
    await expect(
      context.db.insert(contractingMeasures).values({
        assignmentId: arrived.id,
        measureTypeId: measureType.id,
        quantity: 21,
      }),
    ).rejects.toBeDefined();

    const planned = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: job.id, machineId: context.machine.id, implementId: null },
    });
    if (!planned) throw new Error('Expected planned assignment');
    await expect(
      completeJob({
        db: context.db,
        actor: manager,
        input: {
          id: job.id,
          startDate: DateOnlyIso.parse('2026-09-03'),
          endDate: DateOnlyIso.parse('2026-09-03'),
          dieselLitres: 0,
          notes: null,
          removePlannedAssignmentIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.stint_not_planned' });
    const completed = await completeJob({
      db: context.db,
      actor: manager,
      input: {
        id: job.id,
        startDate: DateOnlyIso.parse('2026-09-03'),
        endDate: DateOnlyIso.parse('2026-09-03'),
        dieselLitres: 0,
        notes: null,
        removePlannedAssignmentIds: [planned.id],
      },
    });
    expect(completed).toMatchObject({ status: 'completed', startDate: '2026-09-03', endDate: '2026-09-03' });
    expect(completed.assignments.map((assignment) => assignment.id)).toEqual([arrived.id]);

    const rate = await createRate({
      db: context.db,
      actorUserId: managerId,
      input: { name: 'Per load', basis: 'measure', measureTypeId: measureType.id, amount: 500 },
    });
    await context.db
      .update(contractingMachineAssignments)
      .set({
        rateId: rate.id,
        rateName: rate.name,
        rateBasis: rate.basis,
        rateMeasureTypeId: measureType.id,
        rateUnitAmount: rate.amount,
        computedAmount: 10_000,
        finalAmount: 10_000,
      })
      .where(eq(contractingMachineAssignments.id, arrived.id));
    expect((await listRates({ db: context.db })).find((row) => row.id === rate.id)?.inUse).toBe(true);
    await expect(removeRate({ db: context.db, actorUserId: managerId, id: rate.id })).rejects.toMatchObject({
      code: 'rate_card.in_use',
    });
    await expect(
      removeMeasureType({ db: context.db, actorUserId: managerId, id: measureType.id }),
    ).rejects.toMatchObject({ code: 'rate_card.in_use' });
    expect((await context.db.select().from(auditEvents)).some((event) => event.entityType === 'contracting_job')).toBe(
      true,
    );
  });

  test('requires a resolved split when a sequential stint opens a Gap Flag', async ({ context }) => {
    const firstJob = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const first = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: firstJob.id, machineId: context.machine.id, implementId: null },
    });
    if (!first) throw new Error('Expected assignment');
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: first.id,
        role: 'arrival',
        value: 300,
        capturedAt: '2026-09-04T08:00:00+02:00',
        disputePrevious: false,
      },
    });
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: first.id,
        role: 'departure',
        value: 310,
        capturedAt: '2026-09-04T17:00:00+02:00',
        disputePrevious: false,
        comment: 'Photo unavailable',
      },
    });
    const secondJob = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const second = await createAssignment({
      db: context.db,
      actor: manager,
      input: { jobId: secondJob.id, machineId: context.machine.id, implementId: null },
    });
    if (!second) throw new Error('Expected assignment');
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: second.id,
        role: 'arrival',
        value: 320,
        capturedAt: '2026-09-05T08:00:00+02:00',
        disputePrevious: false,
      },
    });
    await captureReading({
      db: context.db,
      actor: foreman,
      input: {
        machineId: context.machine.id,
        assignmentId: second.id,
        role: 'departure',
        value: 325,
        capturedAt: '2026-09-05T17:00:00+02:00',
        disputePrevious: false,
        comment: 'Photo unavailable',
      },
    });
    await expect(
      completeJob({
        db: context.db,
        actor: manager,
        input: {
          id: secondJob.id,
          startDate: DateOnlyIso.parse('2026-09-05'),
          endDate: DateOnlyIso.parse('2026-09-05'),
          dieselLitres: 0,
          notes: null,
          removePlannedAssignmentIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.open_gap_flags' });
    await expect(
      resolveGap({
        db: context.db,
        actor: manager,
        input: { id: second.id, travelHours: 2, unaccountedHours: 7, reason: 'Wrong total' },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.invalid_reference' });
    await resolveGap({
      db: context.db,
      actor: manager,
      input: { id: second.id, travelHours: 2.5, unaccountedHours: 7.5, reason: 'Yard work' },
    });
    await expect(
      completeJob({
        db: context.db,
        actor: manager,
        input: {
          id: secondJob.id,
          startDate: DateOnlyIso.parse('2026-09-05'),
          endDate: DateOnlyIso.parse('2026-09-05'),
          dieselLitres: 0,
          notes: null,
          removePlannedAssignmentIds: [],
        },
      }),
    ).resolves.toMatchObject({ status: 'completed' });
  });
});
