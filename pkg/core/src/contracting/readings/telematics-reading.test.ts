import { auditEvents, type Db, user } from '@pkg/db';
import { contractingHourReadings, contractingJohnDeereLinks } from '@pkg/db/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine, patchMachine, retireMachine } from '../fleet/machine-service.js';
import { amendHours, exceptionReadings } from '../test/job-fixtures.js';
import { captureReading, latestReading, listReadingExceptions, listReadingsByMachine } from './reading-service.js';
import { recordTelematicsReading, type TelematicsReadingResult } from './telematics-reading.js';

const test = createTester(async ({ db }) => {
  const actorUserId = 'telematics-actor';
  await db.insert(user).values({
    id: actorUserId,
    name: 'Manager',
    email: 'telematics@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const category = await createCategory({ db, actorUserId, input: { name: 'Tractors', kind: 'machine' } });
  const machine = await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({ code: 'T1', make: 'Deere', model: '8R', categoryId: category.id }),
  });
  const [link] = await db
    .insert(contractingJohnDeereLinks)
    .values({
      machineId: machine.id,
      equipmentId: 'eq-1',
      principalId: 1,
      organizationId: '4321',
      deereName: 'Deere 1',
      linkedByUserId: actorUserId,
      linkedAt: new Date('2026-09-01T00:00:00Z'),
    })
    .returning();
  if (!link) throw new Error('link insert returned no row');
  const actor = accessForRole('contracting-manager', actorUserId);
  return { actor, actorUserId, machineId: machine.id, linkId: link.id };
});

const at = (iso: string) => new Date(iso);

type Context = { db: Db; machineId: string; linkId: string };
const reportFor =
  ({ db, machineId, linkId }: Context, now = '2026-09-08T00:00:00Z') =>
  (hours: number, reportTime: string) =>
    recordTelematicsReading({
      db,
      machineId,
      linkId,
      provider: 'john-deere',
      hours,
      reportTime: at(reportTime),
      now: at(now),
    });
const written = (result: TelematicsReadingResult): Exclude<TelematicsReadingResult, { outcome: 'unchanged' }> => {
  if (result.outcome === 'unchanged') throw new Error('expected a reading');
  return result;
};

test('stores a John Deere reading floored to a tenth, as the System, with no photo or capturer', async ({
  context,
}) => {
  const { db, machineId, linkId } = context;
  const result = await recordTelematicsReading({
    db,
    machineId,
    linkId,
    provider: 'john-deere',
    hours: 1000.99,
    reportTime: at('2026-09-07T08:00:00Z'),
    now: at('2026-09-07T09:00:00Z'),
  });
  expect(result).toMatchObject({
    outcome: 'stored',
    reading: {
      role: 'spot',
      value: 1000.9,
      method: 'telematics',
      telematicsProvider: 'john-deere',
      telematicsLinkId: linkId,
      capturedByUserId: null,
      photo: null,
      aiVerification: 'not-applicable',
      disputed: false,
    },
    disputedReadingIds: [],
  });
  const [event] = await db
    .select({ actorUserId: auditEvents.actorUserId, action: auditEvents.action })
    .from(auditEvents)
    .where(eq(auditEvents.entityId, written(result).reading.id));
  expect(event).toEqual({ actorUserId: null, action: 'created' });
  expect(await latestReading({ db, machineId })).toMatchObject({ value: 1000.9 });
});

test('moves the last John Deere reading forward when the same value is reported with nothing read between', async ({
  context,
}) => {
  const { db, machineId } = context;
  const report = reportFor(context);
  const first = await report(1000, '2026-09-07T08:00:00Z');
  const moved = await report(1000.04, '2026-09-07T09:00:00Z');
  expect(moved).toMatchObject({ outcome: 'moved', reading: { capturedAt: at('2026-09-07T09:00:00Z') } });
  expect(written(moved).reading.id).toBe(written(first).reading.id);
  expect(await listReadingsByMachine({ db, machineId })).toHaveLength(1);
  const [event] = await db
    .select({ summary: auditEvents.summary })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityId, written(first).reading.id), eq(auditEvents.action, 'updated')));
  expect(event?.summary).toMatch(/report time moved/i);

  // A new value is a new row.
  expect(await report(1001, '2026-09-07T10:00:00Z')).toMatchObject({ outcome: 'stored' });
  expect(await listReadingsByMachine({ db, machineId })).toHaveLength(2);
});

test('stores a new row instead of moving when a captured reading sits between the two reports', async ({ context }) => {
  const { db, actor, machineId } = context;
  const report = reportFor(context);
  await report(1000, '2026-09-07T08:00:00Z');
  await captureReading({
    db,
    actor,
    input: { machineId, role: 'spot', value: 1000, capturedAt: '2026-09-07T08:30:00Z', disputePrevious: false },
  });
  expect(await report(1000, '2026-09-07T09:00:00Z')).toMatchObject({ outcome: 'stored' });
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.method)).toEqual([
    'telematics',
    'manual',
    'telematics',
  ]);
});

test('leaves the ledger alone for an older or equal report, a retired Machine and a report from the future', async ({
  context,
}) => {
  const { db, actorUserId, machineId } = context;
  const report = (reportTime: string, hours = 1000) => reportFor(context, '2026-09-07T10:00:00Z')(hours, reportTime);
  await report('2026-09-07T08:00:00Z');
  expect(await report('2026-09-07T08:00:00Z', 1001)).toMatchObject({ outcome: 'unchanged', reason: 'not-newer' });
  expect(await report('2026-09-07T07:00:00Z', 1001)).toMatchObject({ outcome: 'unchanged', reason: 'not-newer' });
  expect(await report('2026-09-07T10:06:00Z', 1001)).toMatchObject({
    outcome: 'unchanged',
    reason: 'future-report-time',
  });
  await retireMachine({ db, actorUserId, input: { id: machineId, reason: 'Sold' } });
  expect(await report('2026-09-07T09:00:00Z', 1001)).toMatchObject({
    outcome: 'unchanged',
    reason: 'machine-retired',
  });
  expect(await listReadingsByMachine({ db, machineId })).toHaveLength(1);
});

test('disputes an earlier captured reading above the report, with the reason, and nothing else', async ({
  context,
}) => {
  const { db, actor, machineId } = context;
  const spot = (value: number, capturedAt: string) =>
    captureReading({ db, actor, input: { machineId, role: 'spot', value, capturedAt, disputePrevious: false } });
  const { reading: early } = await spot(1010, '2026-09-07T06:00:00Z');
  const { reading: late } = await spot(1015, '2026-09-07T12:00:00Z');

  const result = await reportFor(context)(1005, '2026-09-07T09:00:00Z');
  expect(written(result).disputedReadingIds).toEqual([early.id]);
  const rows = await listReadingsByMachine({ db, machineId });
  expect(rows.find((row) => row.id === early.id)).toMatchObject({
    disputed: true,
    disputeReason: expect.stringMatching(/^John Deere reported 1\s005\.0 h at 7 Sep 2026, 11:00\.$/),
  });
  expect(rows.find((row) => row.id === late.id)?.disputed).toBe(false);
  expect(rows.find((row) => row.method === 'telematics')?.disputed).toBe(false);
  expect((await exceptionReadings(db)).map((row) => row.id)).toEqual([early.id]);
});

test('disputes a later captured reading below the report, and never a John Deere reading', async ({ context }) => {
  const { db, actor, machineId } = context;
  const { reading: late } = await captureReading({
    db,
    actor,
    input: { machineId, role: 'spot', value: 1100, capturedAt: '2026-09-07T12:00:00Z', disputePrevious: false },
  });
  const report = reportFor(context);
  const high = await report(1200, '2026-09-07T09:00:00Z');
  expect(written(high).disputedReadingIds).toEqual([late.id]);

  // John Deere is beyond dispute, even when a later report reads lower than an earlier one.
  const lower = await report(1150, '2026-09-07T10:00:00Z');
  expect(written(lower).disputedReadingIds).toEqual([]);
  expect((await listReadingsByMachine({ db, machineId })).filter((row) => row.method === 'telematics')).toEqual([
    expect.objectContaining({ value: 1150, disputed: false }),
    expect.objectContaining({ value: 1200, disputed: false }),
  ]);
});

test('settles a contradicted reading when management amends it back into sequence', async ({ context }) => {
  const { db, actor, machineId } = context;
  const spot = (capturedAt: string) =>
    captureReading({ db, actor, input: { machineId, role: 'spot', value: 1100, capturedAt, disputePrevious: false } });
  const { reading: before } = await spot('2026-09-07T06:00:00Z');
  const { reading: after } = await spot('2026-09-07T12:00:00Z');
  const report = reportFor(context);
  await report(1050, '2026-09-07T09:00:00Z');
  await report(1200, '2026-09-07T10:00:00Z');
  expect((await exceptionReadings(db)).map((row) => row.id).sort()).toEqual([before.id, after.id].sort());

  await expect(amendHours(db, actor, after.id, 1150, 'Misread')).rejects.toMatchObject({
    code: 'reading.invalid_amendment',
  });
  await amendHours(db, actor, after.id, 1200, 'Misread');
  // The other contradicted reading keeps its flag until it is amended itself.
  expect((await exceptionReadings(db)).map((row) => row.id)).toEqual([before.id]);
  await amendHours(db, actor, before.id, 1050, 'Misread');
  expect(await listReadingExceptions({ db })).toEqual([]);
});

test('refuses to amend a John Deere reading', async ({ context }) => {
  const { db, actor, machineId } = context;
  const stored = written(await reportFor(context)(1000, '2026-09-07T08:00:00Z'));
  await expect(amendHours(db, actor, stored.reading.id, 999, 'Wrong')).rejects.toMatchObject({
    code: 'reading.invalid_amendment',
    message: 'A Telematics Reading cannot be amended.',
  });
  expect(await listReadingsByMachine({ db, machineId })).toMatchObject([{ value: 1000, amendedBy: null }]);
});

test('crosses Service Due Soon once, only when the report is the Machine’s latest reading', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  await patchMachine({ db, actorUserId, input: { id: machineId, nextServiceDueHours: 1500 } });
  const report = reportFor(context);
  expect(await report(1300, '2026-09-07T06:00:00Z')).toMatchObject({ serviceDueSoonCrossed: false });
  // A human reading later in the day leaves the 07:00 report behind the latest.
  await captureReading({
    db,
    actor,
    input: { machineId, role: 'spot', value: 1301, capturedAt: '2026-09-07T12:00:00Z', disputePrevious: false },
  });
  expect(await report(1450, '2026-09-07T07:00:00Z')).toMatchObject({ outcome: 'stored', serviceDueSoonCrossed: false });
  // Dispute fallout aside, the next report is the latest and brings 50 h to go inside the 100 h threshold.
  expect(await report(1460, '2026-09-07T13:00:00Z')).toMatchObject({ outcome: 'stored', serviceDueSoonCrossed: true });
  expect(await report(1470, '2026-09-07T14:00:00Z')).toMatchObject({ serviceDueSoonCrossed: false });
  expect(await report(1470, '2026-09-07T15:00:00Z')).toMatchObject({ outcome: 'moved', serviceDueSoonCrossed: false });
});

test('refuses a capture that contradicts the nearest John Deere reading past a Disputed captured reading', async ({
  context,
}) => {
  const { db, actor, machineId } = context;
  const spot = (value: number, capturedAt: string) =>
    captureReading({ db, actor, input: { machineId, role: 'spot', value, capturedAt, disputePrevious: false } });
  const { reading: human } = await spot(1100, '2026-09-07T12:00:00Z');
  await reportFor(context)(1200, '2026-09-07T09:00:00Z');
  expect((await exceptionReadings(db)).map((row) => row.id)).toEqual([human.id]);

  // 1150 is above the Disputed 1100, but below the 1200 John Deere reported earlier.
  await expect(spot(1150, '2026-09-07T13:00:00Z')).rejects.toMatchObject({ code: 'reading.below_latest' });
  await expect(spot(1250, '2026-09-07T10:00:00Z')).rejects.toMatchObject({ code: 'reading.above_next' });
  expect(await listReadingsByMachine({ db, machineId })).toHaveLength(2);
});

test('proposes the Read At John Deere puts a refused value at, bracketing it by value', async ({ context }) => {
  const { db, actor, machineId } = context;
  const report = reportFor(context);
  await report(990, '2026-09-07T09:00:00Z');
  await report(1000, '2026-09-07T10:00:00Z');
  await report(1010, '2026-09-07T11:00:00Z');
  await report(1020, '2026-09-07T12:00:00Z');
  await expect(
    captureReading({
      db,
      actor,
      input: { machineId, role: 'spot', value: 1005, capturedAt: '2026-09-07T13:00:00Z', disputePrevious: false },
    }),
  ).rejects.toMatchObject({
    code: 'reading.below_latest',
    suggestedReadAt: {
      readAt: '2026-09-07T10:30:00.000Z',
      floor: { value: 1000, capturedAt: '2026-09-07T10:00:00.000Z' },
      ceiling: { value: 1010, capturedAt: '2026-09-07T11:00:00.000Z' },
    },
  });
});

test('bounds a proposal by when the ceiling’s value was first reported, not where its Read At moved to', async ({
  context,
}) => {
  const { db, actor, machineId } = context;
  const report = reportFor(context);
  await report(1000, '2026-09-07T10:00:00Z');
  const ceiling = written(await report(1010, '2026-09-07T11:00:00Z')).reading;
  // Polled at 11:00, then the Machine stood: later polls move the report's Read At on.
  await db
    .update(contractingHourReadings)
    .set({ createdAt: at('2026-09-07T11:00:00Z') })
    .where(eq(contractingHourReadings.id, ceiling.id));
  expect(await reportFor(context, '2026-09-10T00:00:00Z')(1010, '2026-09-09T07:00:00Z')).toMatchObject({
    outcome: 'moved',
  });
  await expect(
    captureReading({
      db,
      actor,
      input: { machineId, role: 'spot', value: 1005, capturedAt: '2026-09-09T08:00:00Z', disputePrevious: false },
    }),
  ).rejects.toMatchObject({
    suggestedReadAt: {
      readAt: '2026-09-07T10:30:00.000Z',
      ceiling: { value: 1010, capturedAt: '2026-09-07T11:00:00.000Z' },
    },
  });
});

test('disputes a captured reading at the report’s own Read At when it reads higher', async ({ context }) => {
  const { db, actor, machineId } = context;
  const { reading } = await captureReading({
    db,
    actor,
    input: { machineId, role: 'spot', value: 1100, capturedAt: '2026-09-07T09:00:00Z', disputePrevious: false },
  });
  const result = written(await reportFor(context)(1000, '2026-09-07T09:00:00Z'));
  expect(result.disputedReadingIds).toEqual([reading.id]);
});

test('keeps a reading John Deere contradicts disputed when its Disputed pair is settled', async ({ context }) => {
  const { db, actor, machineId } = context;
  const spot = (
    value: number,
    capturedAt: string,
    dispute: Partial<{ disputePrevious: boolean; expectedPreviousId: string }> = {},
  ) =>
    captureReading({
      db,
      actor,
      input: { machineId, role: 'spot', value, capturedAt, disputePrevious: false, ...dispute },
    });
  const { reading: first } = await spot(100, '2026-09-06T20:00:00Z');
  const { reading: second } = await spot(90, '2026-09-07T07:00:00Z', {
    disputePrevious: true,
    expectedPreviousId: first.id,
  });
  // Both are already Disputed as a pair; John Deere then reports 85 after them, below both.
  await reportFor(context)(85, '2026-09-07T10:00:00Z');
  expect((await exceptionReadings(db)).map((row) => row.id).sort()).toEqual([first.id, second.id].sort());

  await amendHours(db, actor, first.id, 80, 'Misread');
  // The pair is settled, but 90 still sits above the 85 John Deere reported later.
  const [remaining] = await exceptionReadings(db);
  expect(remaining).toMatchObject({ id: second.id, disputed: true });
  expect(remaining?.disputeReason).toMatch(/^John Deere reported 85\.0\sh/);
});

test('ignores a report for a Link that was unlinked while it was in flight', async ({ context }) => {
  const { db, actorUserId, machineId, linkId } = context;
  await db
    .update(contractingJohnDeereLinks)
    .set({ unlinkedAt: new Date('2026-09-07T08:00:00Z'), unlinkedByUserId: actorUserId })
    .where(eq(contractingJohnDeereLinks.id, linkId));
  expect(await reportFor(context)(1000, '2026-09-07T09:00:00Z')).toEqual({
    outcome: 'unchanged',
    reason: 'link-not-active',
  });
  expect(await listReadingsByMachine({ db, machineId })).toEqual([]);
});
