import { contractingHourReadings, contractingJobs } from '@pkg/db/contracting';
import { JobListInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import { admin, adminId, foreman, foremanId, leftStint, seedJobFixtures } from '../test/job-fixtures.js';
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
