import type { Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { JobListInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCustomer } from '../customers/customer-service.js';
import { createFarm } from '../customers/farm-service.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import { admin, adminId, foreman, foremanId, leftStint, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
import { listJobs, summarizeJobQueues } from './job-queues.js';
import { getJob } from './job-read.js';
import { createJob } from './job-service.js';

const test = createTester(async ({ db }) => ({ ...(await seedJobFixtures(db)), db }));

const newJob = (context: { db: Db } & Awaited<ReturnType<typeof seedJobFixtures>>) =>
  createJob({
    db: context.db,
    actor: admin,
    input: {
      customerId: context.customer.id,
      farmId: context.farm.id,
      workTypeId: context.workType.id,
      description: null,
      foremanUserId: foremanId,
    },
  });

test('judges Travel against the current Travel Flag threshold on every read, in the detail and the queues alike', async ({
  context,
}) => {
  const { db, excavator } = context;
  const first = await newJob(context);
  await leftStint(db, first.id, excavator.id, 100, 110);
  const second = await newJob(context);
  // 3 h of Travel: inside the default 4 h threshold, outside a 2 h one.
  await leftStint(db, second.id, excavator.id, 113, 120);

  const detail = async () => {
    const read = await getJob({ db, id: second.id });
    return {
      attention: read.assignments[0]?.attention,
      count: read.assignmentAttention,
      threshold: read.travelFlagThresholdHours,
    };
  };
  const queue = async () => {
    const [summary] = (
      await listJobs({ db, actor: admin, input: JobListInput.parse({ queues: ['looks-finished'] }) })
    ).items.filter((item) => item.id === second.id);
    const totals = await summarizeJobQueues({ db, actor: admin });
    return { count: summary?.assignmentAttention, attention: totals.attention['looks-finished'] };
  };
  const threshold = async (travelFlagThresholdHours: number) =>
    updateContractingSettings({
      db,
      actorUserId: adminId,
      input: { ...(await getContractingSettings({ db })), travelFlagThresholdHours },
    });
  expect(await detail()).toEqual({ attention: [], count: 0, threshold: 4 });
  expect(await queue()).toEqual({ count: 0, attention: null });

  await threshold(2);
  expect(await detail()).toEqual({ attention: ['travel-over-threshold'], count: 1, threshold: 2 });
  expect(await queue()).toEqual({ count: 1, attention: 'needs-a-look' });

  // Equal to the threshold is not over it.
  await threshold(3);
  expect(await detail()).toEqual({ attention: [], count: 0, threshold: 3 });
  expect(await queue()).toEqual({ count: 0, attention: null });
});

test('lists only the Jobs needing a look when asked, the SQL agreeing with the domain on every kind', async ({
  context,
}) => {
  const { db, excavator, tipper } = context;
  const clean = await newJob(context);
  await leftStint(db, clean.id, excavator.id, 100, 110);
  const over = await newJob(context);
  // 10 h of Travel after the clean Job's departure: over the default 4 h threshold.
  await leftStint(db, over.id, excavator.id, 120, 125);
  const clamped = await newJob(context);
  // Captured out of order: an arrival below the Machine's last departure stores 0 h, clamped.
  await leftStint(db, clamped.id, excavator.id, 115, 118);
  const deere = await newJob(context);
  const { id: deereStint } = await leftStint(db, deere.id, tipper.id, 50, 60);
  await db
    .update(contractingMachineAssignments)
    .set({ arrivalTelematicsHours: 30, arrivalTelematicsAt: new Date('2026-09-01T06:00:00Z') })
    .where(eq(contractingMachineAssignments.id, deereStint));
  await db.update(contractingJobs).set({ foremanUserId: null }).where(eq(contractingJobs.id, deere.id));

  const kinds = async (jobId: string) => (await getJob({ db, id: jobId })).assignments.flatMap((a) => a.attention);
  expect(await kinds(clean.id)).toEqual([]);
  expect(await kinds(over.id)).toEqual(['travel-over-threshold']);
  expect(await kinds(clamped.id)).toEqual(['travel-clamped']);
  expect(await kinds(deere.id)).toEqual(['john-deere-difference']);

  const listed = async (actor: typeof admin) =>
    (
      await listJobs({ db, actor, input: JobListInput.parse({ queues: ['looks-finished'], needsALook: true }) })
    ).items.map((item) => item.id);
  expect(new Set(await listed(admin))).toEqual(new Set([over.id, clamped.id, deere.id]));
  // Still reader-scoped: the Foreman's own Jobs only.
  expect(new Set(await listed(foreman))).toEqual(new Set([over.id, clamped.id]));

  // Judged against the current thresholds: 10 h of Travel is not over 12 h, nor a 20 h difference over 25 h.
  await updateContractingSettings({
    db,
    actorUserId: adminId,
    input: {
      ...(await getContractingSettings({ db })),
      travelFlagThresholdHours: 12,
      johnDeereDifferenceThresholdHours: 25,
    },
  });
  expect(await listed(admin)).toEqual([clamped.id]);
});

test('lists only the Jobs a Machine has an Assignment on when asked, in any state and any queue', async ({
  context,
}) => {
  const { db, excavator, tipper } = context;
  const job = () => newJob(context);
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
