import type { Db } from '@pkg/db';
import { contractingMachineAssignments } from '@pkg/db/contracting';
import { JobListInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { admin, editHours, foreman, foremanId, leftStint, seedJobFixtures } from '../test/job-fixtures.js';
import { dismissAttention } from './assignment-attention.js';
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

/** A Job whose excavator stint carries 10 h of Travel: over the default 4 h threshold. */
async function overThreshold(context: { db: Db } & Awaited<ReturnType<typeof seedJobFixtures>>) {
  const { db, excavator } = context;
  await leftStint(db, (await newJob(context)).id, excavator.id, 100, 110);
  const job = await newJob(context);
  const stint = await leftStint(db, job.id, excavator.id, 120, 125);
  return { jobId: job.id, stintId: stint.id };
}

const read = async (db: Db, jobId: string) => {
  const job = await getJob({ db, id: jobId });
  const [stint] = job.assignments;
  const listed = await listJobs({
    db,
    actor: admin,
    input: JobListInput.parse({ queues: ['looks-finished'], needsALook: true }),
  });
  const queues = await summarizeJobQueues({ db, actor: admin });
  return {
    attention: stint?.attention,
    dismissed: stint?.dismissedAttention.map(({ kind, dismissedByName }) => ({ kind, dismissedByName })),
    count: job.assignmentAttention,
    listed: listed.items.some((item) => item.id === jobId),
    queue: queues.attention['looks-finished'],
  };
};

test('a dismissal takes the kind off needs a look for everyone: the Job read and the list agree', async ({
  context,
}) => {
  const { db } = context;
  const { jobId, stintId } = await overThreshold(context);
  expect(await read(db, jobId)).toEqual({
    attention: ['travel-over-threshold'],
    dismissed: [],
    count: 1,
    listed: true,
    queue: 'needs-a-look',
  });

  await dismissAttention({ db, actor: admin, input: { assignmentId: stintId, kind: 'travel-over-threshold' } });

  expect(await read(db, jobId)).toEqual({
    attention: [],
    dismissed: [{ kind: 'travel-over-threshold', dismissedByName: 'Jed' }],
    count: 0,
    listed: false,
    queue: null,
  });
});

test('only management dismisses, and only a kind that still holds', async ({ context }) => {
  const { db } = context;
  const { jobId, stintId } = await overThreshold(context);
  const dismiss = (actor: typeof admin, kind: 'travel-over-threshold' | 'john-deere-difference') =>
    dismissAttention({ db, actor, input: { assignmentId: stintId, kind } });

  await expect(dismiss(foreman, 'travel-over-threshold')).rejects.toMatchObject({ code: 'contracting_job.forbidden' });
  await expect(dismiss(admin, 'john-deere-difference')).rejects.toMatchObject({
    code: 'contracting_job.attention_cleared',
  });
  // Dismissing twice keeps the first dismissal.
  await dismiss(admin, 'travel-over-threshold');
  await dismiss(admin, 'travel-over-threshold');
  expect((await read(db, jobId)).dismissed).toEqual([{ kind: 'travel-over-threshold', dismissedByName: 'Jed' }]);
});

test('a dismissal stands until a fact its kind reads changes, then the kind is judged again', async ({ context }) => {
  const { db } = context;
  const { jobId, stintId } = await overThreshold(context);
  // John Deere read 30 h below the arrival: over the default 10 h difference threshold too.
  await db
    .update(contractingMachineAssignments)
    .set({ arrivalTelematicsHours: 90, arrivalTelematicsAt: new Date('2026-09-01T06:00:00Z') })
    .where(eq(contractingMachineAssignments.id, stintId));
  for (const kind of ['travel-over-threshold', 'john-deere-difference'] as const)
    await dismissAttention({ db, actor: admin, input: { assignmentId: stintId, kind } });
  const kinds = async () => {
    const { attention, dismissed } = await read(db, jobId);
    return { attention, dismissed: dismissed?.map(({ kind }) => kind) };
  };
  expect(await kinds()).toEqual({ attention: [], dismissed: ['travel-over-threshold', 'john-deere-difference'] });

  // A new departure is a new comparison with John Deere; Travel did not move.
  await editHours(db, stintId, { arrival: 120, departure: 126 });
  expect(await kinds()).toEqual({ attention: ['john-deere-difference'], dismissed: ['travel-over-threshold'] });

  // A moved arrival recomputes Travel, 11 h being a new number to look at, and snapshots John Deere afresh: this
  // Machine has no Telematics Reading, so there is nothing left to differ from.
  await editHours(db, stintId, { arrival: 121, departure: 126 });
  expect(await kinds()).toEqual({ attention: ['travel-over-threshold'], dismissed: [] });
});
