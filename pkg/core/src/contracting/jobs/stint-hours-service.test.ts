import { auditEvents, user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createImplement, retireImplement } from '../fleet/implement-service.js';
import { getMachine, patchMachine } from '../fleet/machine-service.js';
import { captureReading } from '../readings/reading-service.js';
import {
  admin,
  adminId,
  captureHours,
  foreman,
  foremanId,
  leftStint,
  plannedStint,
  pricedJob,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import { getJob, getReadableJob } from './job-read.js';
import { createJob } from './job-service.js';
import { captureStintHours, editStintHours, setTravelHours } from './stint-hours-service.js';

const driverId = 'stint-driver';
const deviceDriverId = 'stint-driver-device';

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const now = new Date();
  await db.insert(user).values(
    [
      { id: driverId, name: 'Thabo Driver', isDevice: false },
      { id: deviceDriverId, name: 'Driver tablet', isDevice: true },
      { id: 'other-foreman', name: 'Other', isDevice: false, contractingRole: 'foreman' as const },
    ].map(({ id, name, isDevice, contractingRole }) => ({
      id,
      name,
      email: `${id}@example.com`,
      emailVerified: true,
      contractingRole: contractingRole ?? ('driver' as const),
      isDevice,
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
  test('an arrival starts the Job and snapshots Travel against the last departure; a retry writes nothing', async ({
    context,
  }) => {
    const { db, excavator, tipper } = context;
    const first = await openJob(context);
    await leftStint(db, first.id, excavator.id, 100, 150);
    await leftStint(db, first.id, tipper.id, 100, 150);

    const job = await openJob(context);
    const travelled = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    const clamped = await plannedStint(db, admin, { jobId: job.id, machineId: tipper.id, implementId: null });
    expect((await getJob({ db, id: job.id })).status).toBe('upcoming');
    await captureHours(db, travelled.id, 'arrival', 156);
    await captureHours(db, clamped.id, 'arrival', 120);
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
        travelClamped: false,
        attention: ['travel-over-threshold'],
      },
      { id: clamped.id, travelHours: 0, travelClamped: true, attention: ['travel-clamped'] },
    ]);
    expect((await getJob({ db, id: first.id })).assignments[0]).toMatchObject({ travelHours: 0, travelClamped: false });
  });

  test('refuses a busy Machine, a retired Implement, a device Driver, a foreign Job and a departure below arrival', async ({
    context,
  }) => {
    const { db, excavator, tipper, implement } = context;
    const job = await openJob(context);
    const other = await openJob(context);
    const onSite = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    const busy = await plannedStint(db, admin, { jobId: other.id, machineId: excavator.id, implementId: null });
    await captureHours(db, onSite.id, 'arrival', 100);
    await expect(captureHours(db, busy.id, 'arrival', 101)).rejects.toMatchObject({
      code: 'contracting_job.machine_on_site',
    });

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
    await expect(arrive({ driverUserId: deviceDriverId })).rejects.toMatchObject({
      code: 'contracting_job.invalid_driver',
    });
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

    await expect(captureHours(db, onSite.id, 'departure', 99.9)).rejects.toMatchObject({
      code: 'contracting_job.departure_before_arrival',
      message: 'Departure hours must be at or above the arrival hours of 100.0 h.',
    });
    await captureHours(db, onSite.id, 'departure', 100);
    expect((await getJob({ db, id: job.id })).assignments[0]).toMatchObject({ state: 'left', workHours: 0 });
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
    ).rejects.toMatchObject({ code: 'contracting_job.wrong_status', message: 'Capture the departure to record it.' });
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
    await expect(edit(null, 'Never left')).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
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
