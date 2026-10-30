import { randomUUID } from 'node:crypto';
import { auditEvents, type Db, user } from '@pkg/db';
import { contractingMachineAssignments, contractingMeasures } from '@pkg/db/contracting';
import type { JobActor } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { DateOnlyIso } from '@pkg/schema';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCustomer } from '../customers/customer-service.js';
import { createFarm } from '../customers/farm-service.js';
import { createCategory } from '../fleet/category-service.js';
import { createImplement } from '../fleet/implement-service.js';
import { createMachine } from '../fleet/machine-service.js';
import { createMeasureType, removeMeasureType } from '../rate-card/measure-type-service.js';
import { createRate, removeRate } from '../rate-card/rate-service.js';
import { plannedStint } from '../test/job-fixtures.js';
import { createWorkType } from '../work-types/work-type-service.js';
import { getJob } from './job-read.js';
import { completeJob, createJob, patchJob } from './job-service.js';
import { setMeasure } from './measure-service.js';
import { captureStintHours } from './stint-hours-service.js';

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
    input: MachineCreateInput.parse({
      code: 'CAT320-1',
      make: 'CAT',
      model: '320',
      categoryId: category.id,
      currentDriverUserId: driverId,
    }),
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

const captureHours = (db: Db, actor: JobActor, assignmentId: string, role: 'arrival' | 'departure', hours: number) =>
  captureStintHours({ db, actor, input: { assignmentId, role, hours } });

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

  test('names a Foreman at creation only for someone who may assign one', async ({ context }) => {
    const creatorOnly = {
      ...manager,
      permissions: manager.permissions.filter((permission) => permission !== 'contracting_job:assign'),
    };
    await expect(createJob({ db: context.db, actor: creatorOnly, input: jobInput(context) })).rejects.toMatchObject({
      code: 'contracting_job.forbidden',
      message: 'You do not have permission to assign the Foreman.',
    });
    await expect(
      createJob({ db: context.db, actor: creatorOnly, input: { ...jobInput(context), foremanUserId: null } }),
    ).resolves.toMatchObject({ jobNumber: 'CJOB-00001' });
  });

  test('an empty patch writes nothing and still refuses an unknown Job', async ({ context }) => {
    const job = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const jobEventCount = async () =>
      (await context.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'contracting_job'))).length;
    const before = await jobEventCount();

    await expect(patchJob({ db: context.db, actor: manager, input: { id: job.id } })).resolves.toBeUndefined();
    expect(await jobEventCount()).toBe(before);
    await expect(patchJob({ db: context.db, actor: manager, input: { id: randomUUID() } })).rejects.toMatchObject({
      code: 'contracting_job.not_found',
    });
  });
});

describe('Completion and billable facts', () => {
  test('upserts Measures, guards Completion, deletes confirmed planned stints, and locks used rate-card rows', async ({
    context,
  }) => {
    const job = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const arrived = await plannedStint(context.db, manager, {
      jobId: job.id,
      machineId: context.machine.id,
      implementId: null,
    });
    await captureHours(context.db, foreman, arrived.id, 'arrival', 200);
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
    await captureHours(context.db, foreman, arrived.id, 'departure', 210);
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

    const planned = await plannedStint(context.db, manager, {
      jobId: job.id,
      machineId: context.machine.id,
      implementId: null,
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
    ).rejects.toMatchObject({ code: 'contracting_job.stint_not_planned' });
    await completeJob({
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
    const completed = await getJob({ db: context.db, id: job.id });
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
      })
      .where(eq(contractingMachineAssignments.id, arrived.id));
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

  test('completes with Travel over the threshold: only a Machine still on site blocks Completion', async ({
    context,
  }) => {
    const first = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const earlier = await plannedStint(context.db, manager, {
      jobId: first.id,
      machineId: context.machine.id,
      implementId: null,
    });
    await captureHours(context.db, foreman, earlier.id, 'arrival', 300);
    await captureHours(context.db, foreman, earlier.id, 'departure', 310);
    const job = await createJob({ db: context.db, actor: manager, input: jobInput(context) });
    const travelled = await plannedStint(context.db, manager, {
      jobId: job.id,
      machineId: context.machine.id,
      implementId: null,
    });
    await captureHours(context.db, foreman, travelled.id, 'arrival', 320);
    const complete = () =>
      completeJob({
        db: context.db,
        actor: manager,
        input: {
          id: job.id,
          startDate: DateOnlyIso.parse('2026-09-05'),
          endDate: DateOnlyIso.parse('2026-09-05'),
          dieselLitres: 0,
          notes: null,
          removePlannedAssignmentIds: [],
        },
      });
    await expect(complete()).rejects.toMatchObject({
      code: 'contracting_job.has_on_site_stints',
    });
    await captureHours(context.db, foreman, travelled.id, 'departure', 325);
    expect((await getJob({ db: context.db, id: job.id })).assignments[0]).toMatchObject({
      travelHours: 10,
      workHours: 5,
      billableHours: 15,
      attention: ['travel-over-threshold'],
    });
    await complete();
    expect((await getJob({ db: context.db, id: job.id })).status).toBe('completed');
  });
});
