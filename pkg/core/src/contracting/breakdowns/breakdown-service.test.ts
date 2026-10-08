import { auditEvents, user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import { BreakdownListInput } from '@pkg/schema/contracting';
import { and, asc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { InMemoryStorageAdapter } from '../../storage/in-memory-storage-adapter.js';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createImplement } from '../fleet/implement-service.js';
import { createJob } from '../jobs/job-service.js';
import { captureReading } from '../readings/reading-service.js';
import { admin, foreman, foremanId, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
import {
  addBreakdownNote,
  addBreakdownPhotos,
  assignMechanic,
  getBreakdown,
  listBreakdownJobOptions,
  listBreakdowns,
  reportBreakdown,
  solveBreakdown,
  startBreakdown,
} from './breakdown-service.js';

const jpeg = new Uint8Array([255, 216, 255]);
const workshop = accessForRole('workshop-manager', 'connor');
const otherForeman = accessForRole('foreman', 'thabo');

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const now = new Date();
  const person = (id: string, name: string, contractingRole: 'workshop-manager' | 'mechanic' | 'foreman') => ({
    id,
    name,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([
      person('connor', 'Connor', 'workshop-manager'),
      person('danie', 'Danie', 'mechanic'),
      person('thabo', 'Thabo', 'foreman'),
    ]);
  const job = await createJob({
    db,
    actor: admin,
    input: {
      customerId: fixtures.customer.id,
      farmId: fixtures.farm.id,
      workTypeId: fixtures.workType.id,
      description: null,
      foremanUserId: foremanId,
    },
  });
  return { ...fixtures, jobId: job.id, storage: new InMemoryStorageAdapter() };
});

/** Puts the Machine on site on the Job, optionally towing an Implement. */
async function arrive(
  db: Parameters<typeof plannedStint>[0],
  jobId: string,
  machineId: string,
  implementId: string | null = null,
) {
  const stint = await plannedStint(db, admin, { jobId, machineId, implementId });
  await captureReading({
    db,
    actor: foreman,
    input: {
      machineId,
      assignmentId: stint.id,
      role: 'arrival',
      value: 100,
      capturedAt: '2026-09-01T08:00:00+02:00',
      disputePrevious: false,
      comment: 'Photo unavailable',
    },
  });
}

const reportNew = async (...args: Parameters<typeof reportBreakdown>) => (await reportBreakdown(...args)).breakdown;

const report = (subject: { kind: 'machine' | 'implement'; id: string }, extra: Record<string, unknown> = {}) => ({
  subject,
  urgency: 'code-red' as const,
  description: 'Hydraulic hose burst\nOil everywhere',
  ...extra,
});

test('defaults the Job from the on-site stint, and none for a Machine in the yard', async ({ context }) => {
  const { db, excavator, tipper, jobId } = context;
  await arrive(db, jobId, excavator.id);
  const onSite = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  const inYard = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: tipper.id }) });
  expect(onSite).toMatchObject({ jobId, jobNumber: expect.stringMatching(/^CJOB-/), farmName: 'Rooikraal' });
  expect(onSite.firstLine).toBe('Hydraulic hose burst');
  expect(inYard.jobId).toBeNull();
});

test('offers only the open Jobs the subject is on, and a Foreman only his own', async ({ context }) => {
  const { db, excavator, tipper, jobId } = context;
  await plannedStint(db, admin, { jobId, machineId: excavator.id, implementId: null });
  const subject = { kind: 'machine', id: excavator.id } as const;
  expect(await listBreakdownJobOptions({ db, actor: workshop, subject })).toEqual([
    { id: jobId, jobNumber: expect.stringMatching(/^CJOB-/), farmName: 'Rooikraal' },
  ]);
  expect(await listBreakdownJobOptions({ db, actor: foreman, subject })).toHaveLength(1);
  expect(await listBreakdownJobOptions({ db, actor: otherForeman, subject })).toEqual([]);
  expect(await listBreakdownJobOptions({ db, actor: workshop, subject: { kind: 'machine', id: tipper.id } })).toEqual(
    [],
  );
});

test('an Implement reaches its Job through the stint it is attached to', async ({ context }) => {
  const { db, excavator, jobId } = context;
  const category = await createCategory({
    db,
    actorUserId: admin.userId,
    input: { name: 'Rippers', kind: 'implement' },
  });
  const ripper = await createImplement({
    db,
    actorUserId: admin.userId,
    input: { code: 'RIP-1', categoryId: category.id, notes: null },
  });
  await arrive(db, jobId, excavator.id, ripper.id);
  const breakdown = await reportNew({ db, actor: foreman, input: report({ kind: 'implement', id: ripper.id }) });
  expect(breakdown).toMatchObject({ jobId, subject: { kind: 'implement', code: 'RIP-1', categoryName: 'Rippers' } });
});

test('a Foreman reads only his own Breakdowns and another Foreman finds nothing', async ({ context }) => {
  const { db, excavator } = context;
  const mine = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  await expect(getBreakdown({ db, actor: otherForeman, id: mine.id })).rejects.toMatchObject({
    code: 'breakdown.not_found',
  });
  expect((await listBreakdowns({ db, actor: otherForeman, input: listInput() })).items).toEqual([]);
  expect((await listBreakdowns({ db, actor: workshop, input: listInput() })).items.map((row) => row.id)).toEqual([
    mine.id,
  ]);
});

test('solving straight from Open stamps both dates and needs a close-out note', async ({ context }) => {
  const { db, excavator } = context;
  const breakdown = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  await expect(
    solveBreakdown({ db, actor: workshop, input: { id: breakdown.id, closeOutNote: ' ' } }),
  ).rejects.toThrow();
  const solved = await solveBreakdown({
    db,
    actor: workshop,
    input: { id: breakdown.id, closeOutNote: 'Replaced the hose' },
    now: new Date('2026-09-02T10:00:00Z'),
  });
  expect(solved).toMatchObject({
    status: 'solved',
    startedAt: '2026-09-02T10:00:00.000Z',
    solvedAt: '2026-09-02T10:00:00.000Z',
    closeOutNote: 'Replaced the hose',
  });
  await expect(startBreakdown({ db, actor: workshop, id: breakdown.id })).rejects.toMatchObject({
    code: 'breakdown.solved',
  });
});

test('only a Mechanic can be the primary Mechanic', async ({ context }) => {
  const { db, excavator } = context;
  const breakdown = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  await expect(
    assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: 'thabo' } }),
  ).rejects.toMatchObject({ code: 'breakdown.invalid_mechanic' });
  const assigned = await assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: 'danie' } });
  expect(assigned).toMatchObject({ primaryMechanicUserId: 'danie', mechanicName: 'Danie' });
});

test('a replayed report returns the delivered Breakdown and drops the duplicate photos', async ({ context }) => {
  const { db, excavator, storage } = context;
  const input = report({ kind: 'machine', id: excavator.id }, { localId: crypto.randomUUID() });
  const first = await reportBreakdown({ db, actor: foreman, input, evidence: { storage, photos: [jpeg] } });
  const again = await reportBreakdown({ db, actor: foreman, input, evidence: { storage, photos: [jpeg] } });
  expect([first.created, again.created]).toEqual([true, false]);
  expect(again.breakdown.id).toBe(first.breakdown.id);
  expect(storage.objects.size).toBe(1);
  await expect(
    reportBreakdown({ db, actor: workshop, input, evidence: { storage, photos: [jpeg] } }),
  ).rejects.toMatchObject({ code: 'breakdown.report_id_conflict' });
});

test('a Breakdown keeps at most six photos', async ({ context }) => {
  const { db, excavator, storage } = context;
  const breakdown = await reportNew({
    db,
    actor: foreman,
    input: report({ kind: 'machine', id: excavator.id }),
    evidence: { storage, photos: Array.from({ length: 5 }, () => jpeg) },
  });
  await expect(
    addBreakdownPhotos({ db, actor: foreman, id: breakdown.id, evidence: { storage, photos: [jpeg, jpeg] } }),
  ).rejects.toMatchObject({ code: 'breakdown.too_many_photos' });
  expect(storage.objects.size).toBe(5);
});

test('dispatch hints name the other unsolved Breakdowns on the same Job', async ({ context }) => {
  const { db, excavator, tipper, jobId } = context;
  await arrive(db, jobId, excavator.id);
  await arrive(db, jobId, tipper.id);
  const first = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  const second = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: tipper.id }) });
  const solved = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: tipper.id }) });
  await solveBreakdown({ db, actor: workshop, input: { id: solved.id, closeOutNote: 'Fixed' } });
  const detail = await getBreakdown({ db, actor: workshop, id: first.id });
  expect(detail.dispatchHints.map((hint) => hint.breakdownId)).toEqual([second.id]);
  expect(detail.sameJobOpenCount).toBe(1);
});

test('the report and each transition are audited; notes append without an audit event', async ({ context }) => {
  const { db, excavator } = context;
  const breakdown = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  await assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: 'danie' } });
  await startBreakdown({ db, actor: workshop, id: breakdown.id });
  await addBreakdownNote({ db, actor: workshop, input: { breakdownId: breakdown.id, text: 'Which hose?' } });
  await addBreakdownNote({ db, actor: foreman, input: { breakdownId: breakdown.id, text: 'The boom ram one' } });
  await solveBreakdown({ db, actor: workshop, input: { id: breakdown.id, closeOutNote: 'Replaced' } });
  const events = await db
    .select({ action: auditEvents.action, actorUserId: auditEvents.actorUserId })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityType, 'contracting_breakdown'), eq(auditEvents.entityId, breakdown.id)))
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
  expect(events).toEqual([
    { action: 'created', actorUserId: foremanId },
    { action: 'updated', actorUserId: 'connor' },
    { action: 'updated', actorUserId: 'connor' },
    { action: 'updated', actorUserId: 'connor' },
  ]);
  const detail = await getBreakdown({ db, actor: foreman, id: breakdown.id });
  expect(detail.notes.map((note) => [note.authorName, note.text])).toEqual([
    ['Connor', 'Which hose?'],
    ['Sipho', 'The boom ram one'],
  ]);
});

function listInput() {
  return BreakdownListInput.parse({});
}
