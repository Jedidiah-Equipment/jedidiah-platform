import { user } from '@pkg/db';
import { contractingJobNotes } from '@pkg/db/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { ActivityListInput, type ActivityListResult } from '@pkg/schema/contracting';
import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { assignMechanic, reportBreakdown, solveBreakdown } from '../breakdowns/breakdown-service.js';
import { stampInvoice } from '../jobs/invoicing-service.js';
import { cancelJob, createJob } from '../jobs/job-service.js';
import { addNote } from '../notes/note-service.js';
import { admin, foreman, foremanId, invoicing, leftStint, pricedJob, seedJobFixtures } from '../test/job-fixtures.js';
import { activityPageQuery, listActivity } from './activity-service.js';

const workshop = accessForRole('workshop-manager', 'connor');
const otherForeman = accessForRole('foreman', 'thabo');

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const now = new Date();
  await db.insert(user).values(
    (
      [
        ['connor', 'Connor', 'workshop-manager'],
        ['danie', 'Danie', 'mechanic'],
        ['thabo', 'Thabo', 'foreman'],
      ] as const
    ).map(([id, name, contractingRole]) => ({
      id,
      name,
      email: `${id}@example.com`,
      emailVerified: true,
      contractingRole,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const newJob = (foremanUserId: string) =>
    createJob({
      db,
      actor: admin,
      input: {
        customerId: fixtures.customer.id,
        farmId: fixtures.farm.id,
        workTypeId: fixtures.workType.id,
        description: null,
        foremanUserId,
      },
    });
  const siphos = await newJob(foremanId);
  const thabos = await newJob('thabo');
  return { ...fixtures, siphosJobId: siphos.id, thabosJobId: thabos.id };
});

const list = (
  db: Parameters<typeof listActivity>[0]['db'],
  actor: typeof admin,
  input: Partial<ActivityListInput> = {},
) => listActivity({ db, actor, input: ActivityListInput.parse(input) });
const types = (result: ActivityListResult) => result.items.map((item) => item.type);

test('a Foreman sees his own Jobs and Breakdowns, the workshop sees everything, invoicing nothing', async ({
  context,
}) => {
  const { db, excavator, siphosJobId, thabosJobId } = context;
  await addNote({ db, actor: foreman, thread: 'job', input: { id: siphosJobId, text: 'Gate code is 4471' } });
  await addNote({ db, actor: admin, thread: 'job', input: { id: thabosJobId, text: 'Thabo’s Job only' } });
  await reportBreakdown({
    db,
    actor: foreman,
    input: { subject: { kind: 'machine', id: excavator.id }, jobId: null, urgency: 'code-red', description: 'Hose' },
  });

  const sipho = await list(db, foreman);
  expect(sipho.items.map((item) => ('text' in item ? item.text : item.type))).toEqual([
    'breakdown-reported',
    'Gate code is 4471',
  ]);
  expect(types(await list(db, otherForeman))).toEqual(['job-note']);
  expect(types(await list(db, workshop))).toEqual(['breakdown-reported', 'job-note', 'job-note']);
  await expect(list(db, invoicing)).rejects.toMatchObject({ code: 'activity.forbidden' });
});

test('pages by keyset without repeating or skipping notes written in the same instant', async ({ context }) => {
  const { db, siphosJobId } = context;
  const at = new Date('2026-10-13T08:00:00.000Z');
  await db.insert(contractingJobNotes).values(
    Array.from({ length: 5 }, (_, index) => ({
      jobId: siphosJobId,
      authorUserId: foremanId,
      text: `Note ${index}`,
      createdAt: at,
    })),
  );
  // Two more inside the same millisecond, apart only in microseconds: the cursor must not lose them.
  await db.execute(sql`
    insert into contracting.job_note (job_id, author_user_id, text, created_at) values
      (${siphosJobId}, ${foremanId}, 'Micro 1', '2026-10-13T08:00:00.000400Z'),
      (${siphosJobId}, ${foremanId}, 'Micro 2', '2026-10-13T08:00:00.000200Z')
  `);

  const seen: string[] = [];
  let cursor: ActivityListResult['nextCursor'] = null;
  do {
    const page = await list(db, admin, { limit: 2, cursor });
    seen.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);

  expect(seen).toHaveLength(7);
  expect(new Set(seen).size).toBe(7);
});

test('solving straight from Not fixed reads as one Fixed item; assigning and reassigning read as assignments', async ({
  context,
}) => {
  const { db, excavator } = context;
  const { breakdown } = await reportBreakdown({
    db,
    actor: workshop,
    input: { subject: { kind: 'machine', id: excavator.id }, jobId: null, urgency: 'code-green', description: 'Noise' },
  });
  await assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: 'danie' } });
  await assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: 'danie' } });
  await solveBreakdown({ db, actor: workshop, input: { id: breakdown.id, closeOutNote: 'Tightened the belt' } });

  const feed = await list(db, workshop, { breakdownId: breakdown.id });
  expect(types(feed)).toEqual(['breakdown-solved', 'mechanic-assigned', 'breakdown-reported']);
  expect(feed.items[1]).toMatchObject({ mechanicName: 'Danie', actor: { name: 'Connor' } });
  expect(feed.items[0]).toMatchObject({ closeOutNote: 'Tightened the belt', breakdown: { status: 'solved' } });
});

test('a Job’s machines, start, sign-off and cancellation each read once, scoped and filtered', async ({ context }) => {
  const fixtures = context;
  const { db, excavator, tipper, siphosJobId, thabosJobId } = fixtures;
  await leftStint(db, siphosJobId, excavator.id, 100, 110);
  await cancelJob({ db, actor: admin, input: { id: thabosJobId, reason: 'Rain stopped play' } });
  const priced = await pricedJob({ ...fixtures, db }, [{ machineId: tipper.id, arrival: 50, departure: 60 }]);

  const onSipho = await list(db, admin, { jobId: siphosJobId });
  expect(types(onSipho)).toEqual(['machine-left', 'machine-arrived', 'job-started']);
  expect(onSipho.items.at(-1)).toMatchObject({
    type: 'job-started',
    actor: { name: 'Sipho' },
    machine: { code: 'CAT320-1' },
    job: { farmName: 'Rooikraal', customerName: 'Rowley' },
  });
  expect(onSipho.items[0]).toMatchObject({ hours: 110 });

  expect(types(await list(db, admin, { filter: 'jobs' }))).toEqual([
    'job-completed',
    'job-started',
    'job-cancelled',
    'job-started',
  ]);
  expect(types(await list(db, admin, { filter: 'hours', jobId: priced.jobId }))).toEqual([
    'machine-left',
    'machine-arrived',
  ]);
  expect(types(await list(db, admin, { filter: 'notes' }))).toEqual([]);
  expect(await list(db, admin, { search: 'rain stopped' })).toMatchObject({
    items: [{ type: 'job-cancelled', reason: 'Rain stopped play' }],
  });
  expect(types(await list(db, admin, { search: 'TIP-7' }))).toEqual(['machine-left', 'machine-arrived', 'job-started']);
});

test('Add Note works on an Invoiced Job for management and is refused to a Foreman once his Job is Priced', async ({
  context,
}) => {
  const fixtures = context;
  const { db, tipper } = fixtures;
  const priced = await pricedJob({ ...fixtures, db }, [{ machineId: tipper.id, arrival: 10, departure: 20 }]);
  await expect(
    addNote({ db, actor: foreman, thread: 'job', input: { id: priced.jobId, text: 'Too late' } }),
  ).rejects.toMatchObject({
    code: 'contracting_job.wrong_status',
    message: 'This Job is Priced, so you can no longer add a note.',
  });

  await stampInvoice({
    db,
    actor: admin,
    input: { id: priced.jobId, invoiceNumber: 'INV-1', expectedTotal: priced.total },
  });
  const note = await addNote({
    db,
    actor: admin,
    thread: 'job',
    input: { id: priced.jobId, text: '  Paid in full  ' },
  });
  expect(note).toMatchObject({ authorName: 'Jed', text: 'Paid in full' });
  expect((await list(db, admin, { filter: 'notes' })).items).toMatchObject([
    { type: 'job-note', text: 'Paid in full' },
  ]);
});

test('the first page merges indexed branches instead of sorting the union', async ({ context }) => {
  const { db } = context;
  const query = activityPageQuery(db, admin, ActivityListInput.parse({}));
  if (!query) throw new Error('Expected a page query');
  const plan = await db.transaction(async (tx) => {
    // With sorting priced out, a plan still sorts only when some branch has no (stamp, id) index to walk.
    await tx.execute(sql`set local enable_sort = off`);
    // A test table is a handful of rows, where a sequential scan always wins; production tables are not.
    await tx.execute(sql`set local enable_seqscan = off`);
    const rows = await tx.execute<{ 'QUERY PLAN': string }>(sql`explain ${query}`);
    return [...rows].map((row) => row['QUERY PLAN']).join('\n');
  });

  expect(plan).toContain('Merge Append');
  expect(plan.split('\n').filter((line) => /\bSort\b/.test(line) && !line.includes('Sort Key'))).toEqual([]);
});
