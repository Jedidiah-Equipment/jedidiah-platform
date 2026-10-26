import { contractingHourReadings, contractingJobs } from '@pkg/db/contracting';
import { JobListInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCustomer } from '../customers/customer-service.js';
import { createFarm } from '../customers/farm-service.js';
import { captureReading } from '../readings/reading-service.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import { admin, adminId, foreman, foremanId, leftStint, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
import { listJobs, summarizeJobQueues } from './job-queues.js';
import { getJob } from './job-read.js';
import { createJob } from './job-service.js';

const test = createTester(async ({ db }) => ({ ...(await seedJobFixtures(db)), db }));

test('judges an open Hour Gap against the current Gap Flag threshold on every read, in the detail and the queues alike', async ({
  context,
}) => {
  const { db, excavator } = context;
  const job = async () =>
    createJob({
      db,
      actor: admin,
      input: {
        customerId: context.customer.id,
        farmId: context.farm.id,
        workTypeId: context.workType.id,
        description: null,
        foremanUserId: foremanId,
      },
    });
  const first = await job();
  await leftStint(db, first.id, excavator.id, 100, 110);
  const second = await job();
  // A 3 h gap: inside the default 4 h threshold, outside a 2 h one.
  await leftStint(db, second.id, excavator.id, 113, 120);

  const detail = async () => {
    const read = await getJob({ db, id: second.id });
    return { flagged: read.assignments[0]?.gapFlag, open: read.openGapFlags, threshold: read.gapFlagThresholdHours };
  };
  const queue = async () => {
    const [summary] = (
      await listJobs({ db, actor: admin, input: JobListInput.parse({ queues: ['looks-finished'] }) })
    ).items.filter((item) => item.id === second.id);
    const totals = await summarizeJobQueues({ db, actor: admin });
    return { open: summary?.openGapFlags, attention: totals.attention['looks-finished'] };
  };
  expect(await detail()).toEqual({ flagged: false, open: 0, threshold: 4 });
  expect(await queue()).toEqual({ open: 0, attention: null });

  await updateContractingSettings({
    db,
    actorUserId: adminId,
    input: { ...(await getContractingSettings({ db })), gapFlagThresholdHours: 2 },
  });
  expect(await detail()).toEqual({ flagged: true, open: 1, threshold: 2 });
  expect(await queue()).toMatchObject({ open: 1 });
  expect((await queue()).attention).not.toBeNull();

  await updateContractingSettings({
    db,
    actorUserId: adminId,
    input: { ...(await getContractingSettings({ db })), gapFlagThresholdHours: 3 },
  });
  // Equal to the threshold is not over it.
  expect(await detail()).toEqual({ flagged: false, open: 0, threshold: 3 });
  expect(await queue()).toEqual({ open: 0, attention: null });
});

/** A whole stint entered a day late lands in time, so the next stint's Hour Gap starts at its departure. */
test('starts an Hour Gap at the departure before the arrival’s Read At, even one entered after it', async ({
  context,
}) => {
  const { db, excavator } = context;
  const stintOn = async (readings: ReadonlyArray<[number, string]>) => {
    const job = await createJob({
      db,
      actor: admin,
      input: {
        customerId: context.customer.id,
        farmId: context.farm.id,
        workTypeId: context.workType.id,
        description: null,
        foremanUserId: foremanId,
      },
    });
    const planned = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    for (const [index, [value, capturedAt]] of readings.entries())
      await captureReading({
        db,
        actor: foreman,
        input: {
          machineId: excavator.id,
          assignmentId: planned.id,
          role: index === 0 ? 'arrival' : 'departure',
          value,
          capturedAt,
          disputePrevious: false,
        },
      });
    return job;
  };
  await stintOn([
    [100, '2026-09-01T08:00:00Z'],
    [110, '2026-09-01T15:00:00Z'],
  ]);
  const later = await stintOn([
    [130, '2026-09-03T08:00:00Z'],
    [140, '2026-09-03T15:00:00Z'],
  ]);
  const late = await stintOn([
    [115, '2026-09-02T08:00:00Z'],
    [127, '2026-09-02T15:00:00Z'],
  ]);

  const gapOf = async (jobId: string) => {
    const [stint] = (await getJob({ db, id: jobId })).assignments;
    return { from: stint?.previousDeparture?.value, gapHours: stint?.gapHours, gapFlag: stint?.gapFlag };
  };
  expect(await gapOf(later.id)).toEqual({ from: 127, gapHours: 3, gapFlag: false });
  expect(await gapOf(late.id)).toEqual({ from: 110, gapHours: 5, gapFlag: true });
  const openGapFlags = async (jobId: string) =>
    (await listJobs({ db, actor: admin, input: JobListInput.parse({ queues: ['looks-finished'] }) })).items.find(
      (item) => item.id === jobId,
    )?.openGapFlags;
  expect(await openGapFlags(later.id)).toBe(0);
  expect(await openGapFlags(late.id)).toBe(1);
});

test('lists only the Jobs needing a look when asked: an open Gap Flag or a reading the evidence does not confirm', async ({
  context,
}) => {
  const { db, excavator, tipper } = context;
  const job = async () =>
    createJob({
      db,
      actor: admin,
      input: {
        customerId: context.customer.id,
        farmId: context.farm.id,
        workTypeId: context.workType.id,
        description: null,
        foremanUserId: foremanId,
      },
    });
  const clean = await job();
  await leftStint(db, clean.id, excavator.id, 100, 110);
  const gapped = await job();
  // A 10 h gap after the clean Job's departure: over the default 4 h threshold.
  await leftStint(db, gapped.id, excavator.id, 120, 125);
  const unconfirmed = await job();
  const stint = await leftStint(db, unconfirmed.id, tipper.id, 50, 60);
  await db
    .update(contractingHourReadings)
    .set({ aiVerification: 'disagrees' })
    .where(eq(contractingHourReadings.id, stint.departureReadingId));
  await db.update(contractingJobs).set({ foremanUserId: null }).where(eq(contractingJobs.id, unconfirmed.id));

  const listed = async (actor: typeof admin) =>
    (
      await listJobs({ db, actor, input: JobListInput.parse({ queues: ['looks-finished'], needsALook: true }) })
    ).items.map((item) => item.id);
  expect(new Set(await listed(admin))).toEqual(new Set([gapped.id, unconfirmed.id]));
  // Still reader-scoped: the Foreman's own Jobs only.
  expect(await listed(foreman)).toEqual([gapped.id]);

  // Judged against the current threshold: a 10 h gap is not over 12 h.
  await updateContractingSettings({
    db,
    actorUserId: adminId,
    input: { ...(await getContractingSettings({ db })), gapFlagThresholdHours: 12 },
  });
  expect(await listed(admin)).toEqual([unconfirmed.id]);
});

test('lists only the Jobs a Machine has an Assignment on when asked, in any state and any queue', async ({
  context,
}) => {
  const { db, excavator, tipper } = context;
  const job = async () =>
    createJob({
      db,
      actor: admin,
      input: {
        customerId: context.customer.id,
        farmId: context.farm.id,
        workTypeId: context.workType.id,
        description: null,
        foremanUserId: foremanId,
      },
    });
  const planned = await job();
  await plannedStint(db, admin, { jobId: planned.id, machineId: excavator.id, implementId: null });
  const left = await job();
  await leftStint(db, left.id, excavator.id, 100, 110);
  const otherMachine = await job();
  await leftStint(db, otherMachine.id, tipper.id, 50, 60);
  await job();

  const listed = async (machineId: string, actor: typeof admin = admin) =>
    (
      await listJobs({
        db,
        actor,
        input: JobListInput.parse({ queues: ['upcoming', 'active', 'looks-finished'], machineId }),
      })
    ).items.map((item) => item.id);
  expect(new Set(await listed(excavator.id))).toEqual(new Set([planned.id, left.id]));
  expect(await listed(tipper.id)).toEqual([otherMachine.id]);

  await db.update(contractingJobs).set({ foremanUserId: null }).where(eq(contractingJobs.id, planned.id));
  // Still reader-scoped: the Foreman's own Jobs only.
  expect(await listed(excavator.id, foreman)).toEqual([left.id]);
});

test("lists only one Customer's Jobs when asked", async ({ context }) => {
  const { db } = context;
  const other = await createCustomer({ db, actorUserId: adminId, input: { name: 'Botha' } });
  const otherFarm = await createFarm({ db, actorUserId: adminId, input: { customerId: other.id, name: 'Kleinplaas' } });
  const job = async (customerId: string, farmId: string) =>
    createJob({
      db,
      actor: admin,
      input: { customerId, farmId, workTypeId: context.workType.id, description: null, foremanUserId: foremanId },
    });
  const theirs = await job(context.customer.id, context.farm.id);
  const others = await job(other.id, otherFarm.id);

  const listed = async (customerId: string) =>
    (await listJobs({ db, actor: admin, input: JobListInput.parse({ queues: ['upcoming'], customerId }) })).items.map(
      (item) => item.id,
    );
  expect(await listed(context.customer.id)).toEqual([theirs.id]);
  expect(await listed(other.id)).toEqual([others.id]);
});
