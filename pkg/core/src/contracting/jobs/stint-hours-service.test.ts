import { auditEvents, readMigrationStatements, user } from '@pkg/db';
import { contractingMachineAssignments } from '@pkg/db/contracting';
import { getPlantDateNow } from '@pkg/domain';
import { accessForRole } from '@pkg/domain/testing';
import { sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createImplement, retireImplement } from '../fleet/implement-service.js';
import { getMachine, patchMachine, retireMachine } from '../fleet/machine-service.js';
import { captureReading } from '../readings/reading-service.js';
import {
  admin,
  adminId,
  captureHours,
  editHours,
  foreman,
  foremanId,
  leftStint,
  plannedStint,
  pricedJob,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import { getJob, getReadableJob } from './job-read.js';
import { completeJob, createJob } from './job-service.js';
import { captureStintHours, editStintHours, setTravelHours } from './stint-hours-service.js';

const driverId = 'stint-driver';
const deviceDriverId = 'stint-driver-device';
const disabledDriverId = 'stint-driver-disabled';

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const now = new Date();
  await db.insert(user).values(
    [
      { id: driverId, name: 'Thabo Driver', isDevice: false },
      { id: deviceDriverId, name: 'Driver tablet', isDevice: true },
      { id: disabledDriverId, name: 'Sipho Driver', isDevice: false, banned: true },
      { id: 'other-foreman', name: 'Other', isDevice: false, contractingRole: 'foreman' as const },
    ].map(({ id, name, isDevice, banned, contractingRole }) => ({
      id,
      name,
      email: `${id}@example.com`,
      emailVerified: true,
      contractingRole: contractingRole ?? ('driver' as const),
      isDevice,
      banned: banned ?? false,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const implementCategory = await createCategory({
    db,
    actorUserId: adminId,
    input: { name: 'Tip trailers', kind: 'implement' },
  });
  const implement = await createImplement({
    db,
    actorUserId: adminId,
    input: { code: 'TIP-1', categoryId: implementCategory.id, notes: null },
  });
  return { ...fixtures, implement };
});

const openJob = (
  context: {
    db: Parameters<typeof createJob>[0]['db'];
    customer: { id: string };
    farm: { id: string };
    workType: { id: string };
  },
  foremanUserId = foremanId,
) =>
  createJob({
    db: context.db,
    actor: admin,
    input: {
      customerId: context.customer.id,
      farmId: context.farm.id,
      workTypeId: context.workType.id,
      description: null,
      foremanUserId,
    },
  });

describe('capturing Job Hours', () => {
  test('an arrival starts the Job and snapshots Travel against the departure below it; a retry writes nothing', async ({
    context,
  }) => {
    const { db, excavator } = context;
    const first = await openJob(context);
    await leftStint(db, first.id, excavator.id, 100, 150);

    const job = await openJob(context);
    const travelled = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    expect((await getJob({ db, id: job.id })).status).toBe('upcoming');
    await captureHours(db, travelled.id, 'arrival', 156);
    expect((await getJob({ db, id: job.id })).status).toBe('active');

    const events = (await db.select().from(auditEvents)).length;
    await captureHours(db, travelled.id, 'arrival', 156);
    expect(await db.select().from(auditEvents)).toHaveLength(events);

    const read = await getReadableJob({ db, actor: foreman, id: job.id });
    expect(read.assignments).toMatchObject([
      {
        id: travelled.id,
        state: 'on-site',
        arrival: { hours: 156, byName: 'Sipho', telematics: null },
        travelHours: 6,
        attention: ['travel-over-threshold'],
      },
    ]);
    expect((await getJob({ db, id: first.id })).assignments[0]).toMatchObject({ travelHours: 0 });
  });

  test('a Job captured after the fact snapshots Travel against the highest departure at or below its arrival, and the next live arrival ignores it', async ({
    context,
  }) => {
    const { db, excavator } = context;
    const travel = async (jobId: string) => (await getJob({ db, id: jobId })).assignments[0];
    const live = await openJob(context);
    await leftStint(db, live.id, excavator.id, 1480, 1500);
    const older = await openJob(context);
    await leftStint(db, older.id, excavator.id, 900, 990);
    expect(await travel(older.id)).toMatchObject({ travelHours: 0 });

    const backLoaded = await openJob(context);
    await leftStint(db, backLoaded.id, excavator.id, 1000, 1020);
    expect(await travel(backLoaded.id)).toMatchObject({ travelHours: 10 });

    const next = await openJob(context);
    await leftStint(db, next.id, excavator.id, 1503, 1510);
    expect(await travel(next.id)).toMatchObject({ travelHours: 3, attention: [] });
  });

  test('migration 0188 re-snapshots Travel as an arrival would now, leaving Priced Jobs and Travel set by hand alone', async ({
    context,
  }) => {
    const { db, excavator, tipper } = context;
    const stintTravel = async () =>
      new Map(
        (
          await db
            .select({ id: contractingMachineAssignments.id, travelHours: contractingMachineAssignments.travelHours })
            .from(contractingMachineAssignments)
        ).map((stint) => [stint.id, stint.travelHours]),
      );
    // Captured out of meter order, with an arrival exactly at a departure.
    const stints = [
      [1480, 1500],
      [900, 990],
      [1000, 1020],
      [1020, 1030],
      [1503, 1510],
    ] as const;
    const left = [];
    for (const [arrival, departure] of stints)
      left.push(await leftStint(db, (await openJob(context)).id, excavator.id, arrival, departure));
    // Moving each arrival away and back has the service snapshot its Travel against the departures as they stand.
    for (const [index, [arrival, departure]] of stints.entries()) {
      const id = left[index]?.id ?? '';
      await editHours(db, id, { arrival: arrival - 0.1, departure });
      await editHours(db, id, { arrival, departure });
    }
    const handSet = await leftStint(db, (await openJob(context)).id, excavator.id, 1520, 1525);
    await setTravelHours({ db, actor: admin, input: { assignmentId: handSet.id, travelHours: 2 } });
    await leftStint(db, (await openJob(context)).id, tipper.id, 100, 110);
    const priced = await pricedJob(context, [{ machineId: tipper.id, arrival: 120, departure: 130 }]);
    const snapshots = await stintTravel();
    expect(left.map(({ id }) => snapshots.get(id))).toEqual([450, 0, 10, 0, 3]);

    await db.execute(
      sql`alter table contracting.machine_assignment add column travel_clamped boolean not null default false`,
    );
    await db.update(contractingMachineAssignments).set({ travelHours: 0 });
    await db.execute(sql`update contracting.machine_assignment set travel_clamped = true`);
    const [resnapshot] = readMigrationStatements('0188_travel_by_value');
    await db.execute(sql.raw(resnapshot ?? ''));

    expect(await stintTravel()).toEqual(new Map([...snapshots, [handSet.id, 0], [priced.stints[0]?.id ?? '', 0]]));
  });

  test('a Machine and Implement still on site elsewhere arrive anyway, warning which Job still has them', async ({
    context,
  }) => {
    const { db, excavator, tipper, implement } = context;
    const current = await openJob(context);
    const backLoaded = await openJob(context);
    const onSite = await plannedStint(db, admin, {
      jobId: current.id,
      machineId: excavator.id,
      implementId: implement.id,
    });
    expect(await captureHours(db, onSite.id, 'arrival', 500)).toMatchObject({ warnings: [] });
    const earlier = await plannedStint(db, admin, {
      jobId: backLoaded.id,
      machineId: excavator.id,
      implementId: implement.id,
    });
    expect(await captureHours(db, earlier.id, 'arrival', 100)).toMatchObject({
      warnings: [
        `CAT320-1 is also on site on ${current.jobNumber} — its departure there hasn't been captured.`,
        `TIP-1 is also on site on ${current.jobNumber} — its departure there hasn't been captured.`,
      ],
    });
    expect((await getJob({ db, id: backLoaded.id })).assignments[0]).toMatchObject({ state: 'on-site' });

    const first = await plannedStint(db, admin, { jobId: backLoaded.id, machineId: tipper.id, implementId: null });
    const second = await plannedStint(db, admin, { jobId: backLoaded.id, machineId: tipper.id, implementId: null });
    await captureHours(db, first.id, 'arrival', 10);
    expect((await captureHours(db, second.id, 'arrival', 10)).warnings).toEqual([
      `TIP-7 is also on site on ${backLoaded.jobNumber} — its departure there hasn't been captured.`,
    ]);

    // The Job the Machine is still on waits for its departure there.
    const today = getPlantDateNow();
    const complete = () =>
      completeJob({
        db,
        actor: admin,
        input: {
          id: current.id,
          startDate: today,
          endDate: today,
          dieselLitres: 0,
          notes: null,
          removePlannedAssignmentIds: [],
        },
      });
    await expect(complete()).rejects.toMatchObject({ code: 'contracting_job.has_on_site_stints' });
    await captureHours(db, onSite.id, 'departure', 510);
    await complete();
    expect((await getJob({ db, id: current.id })).status).toBe('completed');
  });

  test('refuses a retired Machine, a retired Implement, a device or Disabled Driver, a foreign Job and a departure below arrival', async ({
    context,
  }) => {
    const { db, excavator, tipper, implement } = context;
    const job = await openJob(context);
    const other = await openJob(context);
    const onSite = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    await captureHours(db, onSite.id, 'arrival', 100);

    const planned = await plannedStint(db, admin, { jobId: other.id, machineId: tipper.id, implementId: null });
    const arrive = (stintOverrides: { implementId?: string; driverUserId?: string | null }) =>
      captureStintHours({
        db,
        actor: foreman,
        input: { assignmentId: planned.id, role: 'arrival', hours: 10, stintOverrides },
      });
    await retireImplement({ db, actorUserId: adminId, input: { id: implement.id, reason: 'Sold' } });
    await expect(arrive({ implementId: implement.id })).rejects.toMatchObject({
      code: 'contracting_job.invalid_reference',
      message: 'The selected Implement is no longer available.',
    });
    for (const driverUserId of [deviceDriverId, disabledDriverId])
      await expect(arrive({ driverUserId })).rejects.toMatchObject({ code: 'contracting_job.invalid_driver' });
    await arrive({ driverUserId: driverId });
    expect((await getJob({ db, id: other.id })).assignments.find((stint) => stint.id === planned.id)).toMatchObject({
      driverUserId: driverId,
      state: 'on-site',
    });

    const foreign = await openJob(context, 'other-foreman');
    const foreignStint = await plannedStint(db, admin, {
      jobId: foreign.id,
      machineId: excavator.id,
      implementId: null,
    });
    await expect(captureHours(db, foreignStint.id, 'arrival', 100)).rejects.toMatchObject({
      code: 'contracting_job.not_owner',
    });

    // Retired while on site: it can still leave, so the Job can finish, but it arrives nowhere new.
    const later = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    await retireMachine({ db, actorUserId: adminId, input: { id: excavator.id, reason: 'Sold' } });
    await expect(captureHours(db, onSite.id, 'departure', 99.9)).rejects.toMatchObject({
      code: 'contracting_job.departure_before_arrival',
      message: 'Departure hours must be at or above the arrival hours of 100.0 h.',
    });
    await captureHours(db, onSite.id, 'departure', 100);
    expect((await getJob({ db, id: job.id })).assignments[0]).toMatchObject({ state: 'left', workHours: 0 });
    await expect(captureHours(db, later.id, 'arrival', 120)).rejects.toMatchObject({
      code: 'contracting_job.invalid_reference',
      message: 'This Machine is retired.',
    });
  });

  test('Known Hours take the higher of the ledger and the Job Hours, and a capture crosses Service Due Soon', async ({
    context,
  }) => {
    const { db, excavator } = context;
    await patchMachine({ db, actorUserId: adminId, input: { id: excavator.id, nextServiceDueHours: 1500 } });
    await captureReading({
      db,
      actor: accessForRole('contracting-admin', adminId),
      input: { machineId: excavator.id, value: 1300, capturedAt: '2026-09-01T08:00:00Z' },
    });
    const job = await openJob(context);
    const stint = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    expect(await captureHours(db, stint.id, 'arrival', 1350)).toEqual({
      machineId: excavator.id,
      serviceDueSoonCrossed: false,
      warnings: [],
    });
    expect(await getMachine({ db, id: excavator.id })).toMatchObject({ knownHours: 1350, knownHoursSource: 'job' });
    expect((await captureHours(db, stint.id, 'departure', 1420)).serviceDueSoonCrossed).toBe(true);
    expect(await getMachine({ db, id: excavator.id })).toMatchObject({ knownHours: 1420, knownHoursSource: 'job' });
  });
});

describe('editing Job Hours and Travel', () => {
  test('a moved arrival recomputes Travel until it is set by hand', async ({ context }) => {
    const { db, excavator } = context;
    const first = await openJob(context);
    await leftStint(db, first.id, excavator.id, 100, 150);
    const job = await openJob(context);
    const stint = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    await captureHours(db, stint.id, 'arrival', 152);
    const edit = (arrivalHours: number) =>
      editStintHours({ db, actor: foreman, input: { assignmentId: stint.id, arrivalHours, departureHours: null } });
    const travel = async () => (await getJob({ db, id: job.id })).assignments[0];

    await edit(158);
    expect(await travel()).toMatchObject({ travelHours: 8, attention: ['travel-over-threshold'] });
    await setTravelHours({ db, actor: admin, input: { assignmentId: stint.id, travelHours: 2 } });
    await edit(159);
    expect(await travel()).toMatchObject({
      arrival: { hours: 159 },
      travelHours: 2,
      travelSetByName: 'Jed',
      attention: [],
    });
    await expect(
      editStintHours({ db, actor: foreman, input: { assignmentId: stint.id, arrivalHours: 159, departureHours: 170 } }),
    ).rejects.toMatchObject({
      code: 'contracting_job.departure_not_editable',
      message: 'Capture the departure to record it.',
    });
    await expect(
      setTravelHours({ db, actor: foreman, input: { assignmentId: stint.id, travelHours: 1 } }),
    ).rejects.toMatchObject({ code: 'contracting_job.forbidden' });
  });

  test('a signed-off edit needs a reason, and a Priced Job returns to Completed', async ({ context }) => {
    const { db, excavator } = context;
    const priced = await pricedJob(context, [{ machineId: excavator.id, arrival: 100, departure: 150 }]);
    const [stint] = priced.stints;
    if (!stint) throw new Error('Expected a stint');
    const edit = (departureHours: number | null, reason?: string) =>
      editStintHours({
        db,
        actor: admin,
        input: { assignmentId: stint.id, arrivalHours: 100, departureHours, reason },
      });

    await expect(edit(160)).rejects.toMatchObject({ code: 'contracting_job.reason_required' });
    await expect(edit(null, 'Never left')).rejects.toMatchObject({ code: 'contracting_job.departure_not_editable' });
    await expect(
      editStintHours({ db, actor: foreman, input: { assignmentId: stint.id, arrivalHours: 100, departureHours: 160 } }),
    ).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
    await edit(160, 'Misread the meter');
    expect(await getJob({ db, id: priced.jobId })).toMatchObject({
      status: 'completed',
      assignments: [
        {
          workHours: 60,
          amendment: { byName: 'Jed', reason: 'Misread the meter' },
        },
      ],
    });
  });
});
