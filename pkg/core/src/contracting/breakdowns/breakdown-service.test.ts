import { auditEvents, user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import { DateOnlyIso } from '@pkg/schema';
import { ActivityListInput, BreakdownListInput, type BreakdownPatchInput, JobListInput } from '@pkg/schema/contracting';
import { and, asc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { InMemoryStorageAdapter } from '../../storage/in-memory-storage-adapter.js';
import { createTester } from '../../test/create-tester.js';
import { assertContractingAccountChangeAllowed } from '../account-change.js';
import { listActivity } from '../activity/activity-service.js';
import { listMachinesWithOpenBreakdowns } from '../fleet/machine-service.js';
import { onSiteAssignment } from '../fleet/on-site-assignment.js';
import { listJobs } from '../jobs/job-queues.js';
import { createJob } from '../jobs/job-service.js';
import { listMechanics } from '../mechanics.js';
import { addNote } from '../notes/note-service.js';
import { captureReading } from '../readings/reading-service.js';
import { openServiceRecord } from '../services/service-record-service.js';
import { admin, adminId, foreman, foremanId, invoicing, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
import {
  addBreakdownPhotos,
  assignMechanic,
  getBreakdown,
  listBreakdownFilterOptions,
  listBreakdownJobOptions,
  listBreakdowns,
  patchBreakdown,
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

test('files an omitted Job on the subject’s on-site Assignment, and none in the yard', async ({ context }) => {
  const { db, excavator, tipper, jobId } = context;
  await arrive(db, jobId, excavator.id);
  const onSite = { kind: 'machine', id: excavator.id } as const;
  const inYard = { kind: 'machine', id: tipper.id } as const;
  const filed = await reportNew({ db, actor: foreman, input: report(onSite) });
  expect(filed.jobId).toBe((await onSiteAssignment({ db, subject: onSite }))?.jobId);
  expect(filed).toMatchObject({ jobId, jobNumber: expect.stringMatching(/^CJOB-/), farmName: 'Rooikraal' });
  expect(filed.firstLine).toBe('Hydraulic hose burst');
  expect(await onSiteAssignment({ db, subject: inYard })).toBeNull();
  expect((await reportNew({ db, actor: foreman, input: report(inYard) })).jobId).toBeNull();
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
  expect(await listBreakdownFilterOptions({ db, actor: otherForeman })).toEqual({
    subjects: [],
    jobs: [],
    farms: [],
    reporters: [],
    mechanics: [],
  });
  expect(await listBreakdownFilterOptions({ db, actor: workshop })).toMatchObject({
    subjects: [{ kind: 'machine', id: excavator.id, code: 'CAT320-1' }],
    reporters: [{ id: foremanId }],
  });
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

test('a patch escalates only when it moves a Breakdown from Code Green to Code Red', async ({ context }) => {
  const { db, excavator } = context;
  const { id } = await reportNew({
    db,
    actor: foreman,
    input: report({ kind: 'machine', id: excavator.id }, { urgency: 'code-green' }),
  });
  const patch = async (input: Omit<BreakdownPatchInput, 'id'>) => {
    const { breakdown, escalated } = await patchBreakdown({ db, actor: workshop, input: { id, ...input } });
    return [breakdown.urgency, escalated];
  };
  expect(await patch({ description: 'Rattle' })).toEqual(['code-green', false]);
  expect(await patch({ urgency: 'code-red' })).toEqual(['code-red', true]);
  expect(await patch({ urgency: 'code-red' })).toEqual(['code-red', false]);
  expect(await patch({ urgency: 'code-green' })).toEqual(['code-green', false]);
});

test('a Mechanic or the workshop manager can be the primary Mechanic, listed by name', async ({ context }) => {
  const { db, excavator } = context;
  await db.insert(user).values({
    id: 'bay-tablet',
    name: 'Bay tablet',
    email: 'bay-tablet@example.com',
    emailVerified: true,
    contractingRole: 'workshop-manager',
    isDevice: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  expect(await listMechanics({ db })).toEqual([
    { id: 'connor', name: 'Connor' },
    { id: 'danie', name: 'Danie' },
  ]);
  const breakdown = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  for (const mechanicUserId of ['thabo', 'bay-tablet'])
    await expect(
      assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId } }),
    ).rejects.toMatchObject({ code: 'breakdown.invalid_mechanic' });
  expect(
    await assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: 'connor' } }),
  ).toMatchObject({ primaryMechanicUserId: 'connor', mechanicName: 'Connor' });
  const assigned = await assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: 'danie' } });
  expect(assigned).toMatchObject({ primaryMechanicUserId: 'danie', mechanicName: 'Danie' });
  // Moved out of the set, Danie still names the Workshop's Mechanic filter for the work he was given.
  await db.update(user).set({ contractingRole: 'contracting-manager' }).where(eq(user.id, 'danie'));
  expect((await listBreakdownFilterOptions({ db, actor: workshop })).mechanics).toEqual([
    { id: 'danie', name: 'Danie' },
  ]);
});

test('a role change leaving the set waits until unfixed Breakdowns and open Service Records move', async ({
  context,
}) => {
  const { db, excavator } = context;
  const change = (
    userId: string,
    data: { contractingRole?: 'workshop-manager' | 'contracting-manager'; isDevice?: true },
  ) => assertContractingAccountChangeAllowed({ db, userId, ...data });
  const refusal = {
    code: 'breakdown.invalid_mechanic',
    message:
      "Reassign this mechanic's Breakdowns that are not yet Fixed and open Service Records before changing their role.",
  };
  const breakdown = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  await assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: 'connor' } });
  await expect(change('connor', { contractingRole: 'contracting-manager' })).rejects.toMatchObject(refusal);
  await expect(change('connor', { isDevice: true })).rejects.toMatchObject(refusal);
  await solveBreakdown({ db, actor: workshop, input: { id: breakdown.id, closeOutNote: 'Replaced the hose' } });
  await expect(change('connor', { contractingRole: 'contracting-manager' })).resolves.toBeUndefined();

  await openServiceRecord({
    db,
    actorUserId: adminId,
    input: {
      machineId: excavator.id,
      startDate: DateOnlyIso.parse('2026-10-01'),
      primaryMechanicUserId: 'danie',
      notes: null,
    },
  });
  await expect(change('danie', { contractingRole: 'workshop-manager' })).resolves.toBeUndefined();
  await expect(change('danie', { contractingRole: 'contracting-manager' })).rejects.toMatchObject(refusal);
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
  await addNote({
    db,
    actor: workshop,
    thread: 'breakdown',
    input: { id: breakdown.id, text: 'Which hose?' },
  });
  await addNote({
    db,
    actor: foreman,
    thread: 'breakdown',
    input: { id: breakdown.id, text: 'The boom ram one' },
  });
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
  const notes = await listActivity({
    db,
    actor: foreman,
    input: ActivityListInput.parse({ breakdownId: breakdown.id, filter: 'notes' }),
  });
  expect(notes.items.map((note) => [note.actor.name, 'text' in note ? note.text : null])).toEqual([
    ['Sipho', 'The boom ram one'],
    ['Connor', 'Which hose?'],
  ]);
});

function listInput() {
  return BreakdownListInput.parse({});
}

test('Job and Machine rows list their unsolved Breakdowns, Code Red first, for each reader who may open them', async ({
  context,
}) => {
  const { db, excavator, tipper, jobId } = context;
  await arrive(db, jobId, excavator.id);
  await arrive(db, jobId, tipper.id);
  const green = await reportNew({
    db,
    actor: foreman,
    input: report({ kind: 'machine', id: tipper.id }, { urgency: 'code-green', description: 'Rattle' }),
  });
  const down = await reportNew({ db, actor: foreman, input: report({ kind: 'machine', id: excavator.id }) });
  const jobFlags = async (actor: Parameters<typeof listJobs>[0]['actor']) =>
    (await listJobs({ db, actor, input: JobListInput.parse({ queues: ['active'] }) })).items.find(
      (item) => item.id === jobId,
    )?.openBreakdowns;
  const machineFlags = async (actor: Parameters<typeof listJobs>[0]['actor']) =>
    new Map(
      (await listMachinesWithOpenBreakdowns({ db, actor, input: { status: 'active', search: '' } })).map((machine) => [
        machine.id,
        machine.openBreakdowns,
      ]),
    );
  const red = (status: 'open' | 'in-progress') => ({
    id: down.id,
    urgency: 'code-red',
    status,
    subjectCode: 'CAT320-1',
    firstLine: 'Hydraulic hose burst',
  });
  const rattle = { id: green.id, urgency: 'code-green', status: 'open', subjectCode: 'TIP-7', firstLine: 'Rattle' };

  // The Code Green was reported first, and still comes second.
  expect(await jobFlags(admin)).toEqual([red('open'), rattle]);
  expect(await jobFlags(foreman)).toEqual([red('open'), rattle]);
  const machines = await machineFlags(admin);
  expect(machines.get(excavator.id)).toEqual([red('open')]);
  expect(machines.get(tipper.id)).toEqual([rattle]);
  // A role that reads no Breakdowns is told of none.
  expect([...(await machineFlags(invoicing)).values()].flat()).toEqual([]);

  await startBreakdown({ db, actor: workshop, id: down.id });
  expect(await jobFlags(admin)).toEqual([red('in-progress'), rattle]);
  await solveBreakdown({ db, actor: workshop, input: { id: down.id, closeOutNote: 'Replaced' } });
  expect(await jobFlags(admin)).toEqual([rattle]);
  expect((await machineFlags(admin)).get(excavator.id)).toEqual([]);
});
