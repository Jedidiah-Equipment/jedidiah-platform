import { auditEvents, user } from '@pkg/db';
import { contractingJohnDeereLinks } from '@pkg/db/contracting';
import { PREVIOUS_READING_WRONG, readingExceptionTypes } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { MachineCreateInput, type ReadingCaptureInput } from '@pkg/schema/contracting';
import { and, desc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine, getMachine, patchMachine, retireMachine } from '../fleet/machine-service.js';
import { createJob } from '../jobs/job-service.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import {
  admin,
  amendHours,
  exceptionReadings,
  foreman,
  foremanId,
  leftStint,
  plannedStint,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import type { ReadMeterPhoto } from './reading-evidence.js';
import {
  amendReadings,
  captureReading,
  getReadingForEvidence,
  latestReading,
  listReadingsByMachine,
  type ReadingEvidence,
  verifyCapturedReading,
} from './reading-service.js';
import { recordTelematicsReading } from './telematics-reading.js';

const photoEvidence = (storage: ReadingEvidence['storage']): ReadingEvidence => ({
  storage,
  photoBytes: new Uint8Array([255, 216, 255]),
});

/** A photo capture followed by the AI check the API runs once the capture has answered. */
async function withBackgroundCheck(
  db: Parameters<typeof verifyCapturedReading>[0]['db'],
  storage: ReadingEvidence['storage'],
  readPhoto: ReadMeterPhoto,
  capture: ReturnType<typeof captureReading>,
) {
  const { reading } = await capture;
  return verifyCapturedReading({ db, id: reading.id, storage, readPhoto });
}

const test = createTester(async ({ db }) => {
  const actorUserId = 'reading-actor';
  await db.insert(user).values({
    id: actorUserId,
    name: 'Manager',
    email: 'readings@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const category = await createCategory({ db, actorUserId, input: { name: 'Tractors', kind: 'machine' } });
  const machine = await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({ code: 'T1', make: 'Deere', model: '6140', categoryId: category.id }),
  });
  return { actor: accessForRole('contracting-manager', actorUserId), actorUserId, machineId: machine.id };
});

test('flags both disputed readings and clears the resolved pair with an audited amendment', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  const { listReadingExceptions } = await import('./reading-service.js');
  const input = {
    machineId,
    role: 'spot' as const,
    value: 1200,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  const { reading: previous } = await captureReading({ db, actor, input });
  await captureReading({ db, actor, input: { ...input, value: 121, disputePrevious: true } });
  expect((await exceptionReadings(db)).map((row) => row.disputed)).toEqual([true, true]);
  await expect(amendHours(db, actor, previous.id, 120, ' ')).rejects.toThrow();
  await amendHours(db, actor, previous.id, 120, 'Tenths drum misread');
  expect(await listReadingExceptions({ db })).toEqual([]);
  expect((await listReadingsByMachine({ db, machineId })).find((row) => row.id === previous.id)).toMatchObject({
    value: 120,
    amendedBy: actorUserId,
    amendmentReason: 'Tenths drum misread',
    amendedAt: expect.any(Date),
  });
});

test('a failed check throws for the log, keeps the photo, and waits for Re-verify or the next start-up', async ({
  context,
}) => {
  const { db, actor, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { getReading, listReadingsAwaitingVerification, reverifyReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const { reading: captured } = await captureReading({
    db,
    actor,
    evidence: photoEvidence(storage),
    input: { machineId, role: 'spot', value: 123.4, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
  });
  await expect(
    verifyCapturedReading({
      db,
      id: captured.id,
      storage,
      readPhoto: async () => {
        throw new Error('Model unavailable');
      },
    }),
  ).rejects.toMatchObject({ code: 'reading.verification_failed' });
  expect(await getReading({ db, id: captured.id })).toMatchObject({
    method: 'photo',
    photo: { contentType: 'image/jpeg' },
    aiVerification: 'pending',
    value: 123.4,
  });
  expect(await listReadingsAwaitingVerification({ db })).toEqual([captured.id]);
  const reverified = await reverifyReading({
    db,
    actorUserId,
    id: captured.id,
    storage,
    readPhoto: async () => ({ value: 123.4, confidence: 0.95 }),
  });
  expect(reverified).toMatchObject({ aiValue: 123.4, aiConfidence: 0.95, aiVerification: 'agrees', value: 123.4 });
  expect(await listReadingsAwaitingVerification({ db })).toEqual([]);
});

test('serializes competing captures and preserves the ledger when an upload or insert fails', async ({ context }) => {
  const { db, actor, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const storage = new InMemoryStorageAdapter();
  const input = {
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actor, input });
  const results = await Promise.allSettled(
    [110, 105].map((value) =>
      captureReading({ db, actor, input: { ...input, value, capturedAt: '2026-09-08T08:00:00Z' } }),
    ),
  );
  expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
  const history = await listReadingsByMachine({ db, machineId });
  expect(history.every((row, i) => !history[i + 1] || row.value >= (history[i + 1]?.value ?? 0))).toBe(true);
  await expect(
    captureReading({
      db,
      actor,
      input: { ...input, value: 90 },
      evidence: photoEvidence(storage),
    }),
  ).rejects.toMatchObject({ code: 'reading.below_latest' });
  expect(storage.objects.size).toBe(0);
  const brokenStorage = {
    ...storage,
    get: storage.get.bind(storage),
    deleteObject: storage.deleteObject.bind(storage),
    put: async () => {
      throw new Error('Storage unavailable');
    },
  };
  await expect(
    captureReading({
      db,
      actor,
      input: { ...input, value: 120 },
      evidence: photoEvidence(brokenStorage),
    }),
  ).rejects.toThrow('Storage unavailable');
  expect(await listReadingsByMachine({ db, machineId })).toEqual(history);
});

test('surfaces disagreements and low confidence and recalculates verification after amendment', async ({ context }) => {
  const { db, actor, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { listReadingExceptions } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const args = {
    db,
    actor,
    input: {
      machineId,
      role: 'spot' as const,
      value: 1200,
      capturedAt: '2026-09-07T08:00:00Z',
      disputePrevious: false,
    },
  };
  const row = await withBackgroundCheck(
    db,
    storage,
    async () => ({ value: 120, confidence: 0.9 }),
    captureReading({ ...args, evidence: photoEvidence(storage) }),
  );
  expect(row).toMatchObject({ aiVerification: 'disagrees', aiHint: 'Possible tenths-drum misread (≈10× / 0.1×).' });
  await amendHours(db, actor, row.id, 120, 'Corrected tenths');
  expect(await listReadingExceptions({ db })).toEqual([]);
  const low = await withBackgroundCheck(
    db,
    storage,
    async () => ({ value: 121, confidence: 0.79 }),
    captureReading({ ...args, input: { ...args.input, value: 121 }, evidence: photoEvidence(storage) }),
  );
  expect((await exceptionReadings(db))[0]).toMatchObject({
    id: low.id,
    aiValue: 121,
    aiConfidence: 0.79,
    aiVerification: 'low-confidence',
  });
});

test('management can acknowledge an incorrect AI warning without claiming AI agreement; reverify reopens it', async ({
  context,
}) => {
  const { db, actor, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { listReadingExceptions, reverifyReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const readPhoto = async () => ({ value: 1234, confidence: 0.6 });
  const reading = await withBackgroundCheck(
    db,
    storage,
    readPhoto,
    captureReading({
      db,
      actor,
      evidence: photoEvidence(storage),
      input: { machineId, role: 'spot', value: 123.4, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
    }),
  );
  expect((await listReadingExceptions({ db })).length).toBe(1);
  const amended = await amendHours(
    db,
    actor,
    reading.id,
    123.4,
    'Checked the photo: typed value is correct; AI missed the decimal.',
  );
  expect(amended).toMatchObject({
    aiVerification: 'low-confidence',
    aiValue: 1234,
    evidenceReviewedAt: expect.any(Date),
  });
  expect(await listReadingExceptions({ db })).toEqual([]);
  await reverifyReading({ db, actorUserId, storage, readPhoto, id: reading.id });
  expect((await listReadingExceptions({ db })).length).toBe(1);
});

test('ignores a stale dispute flag on equal and increasing captures', async ({ context }) => {
  const { db, actor, machineId } = context;
  const { listReadingExceptions } = await import('./reading-service.js');
  const input = {
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actor, input });
  for (const value of [100, 100.5])
    expect(
      (await captureReading({ db, actor, input: { ...input, value, disputePrevious: true } })).reading,
    ).toMatchObject({
      disputed: false,
      disputedPreviousId: null,
    });
  expect(await listReadingExceptions({ db })).toEqual([]);
});

test('failed re-verification preserves the previous AI evidence and its management acknowledgement', async ({
  context,
}) => {
  const { db, actor, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { reverifyReading, getReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const { reading: row } = await captureReading({
    db,
    actor,
    evidence: photoEvidence(storage),
    input: { machineId, role: 'spot', value: 100, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
  });
  const reviewed = await amendHours(db, actor, row.id, 100, 'The photo confirms 100 hours');
  await expect(
    reverifyReading({
      db,
      actorUserId,
      id: row.id,
      storage,
      readPhoto: async () => {
        throw new Error('Model unavailable');
      },
    }),
  ).rejects.toMatchObject({ code: 'reading.verification_failed' });
  expect(await getReading({ db, id: row.id })).toEqual(reviewed);
});

test('acknowledges evidence on an unchanged disputed value while keeping the unresolved pair visible', async ({
  context,
}) => {
  const { db, actor, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { listReadingExceptions } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const input = {
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actor, input });
  const disputed = await withBackgroundCheck(
    db,
    storage,
    async () => ({ value: null, confidence: 0.99 }),
    captureReading({
      db,
      actor,
      evidence: photoEvidence(storage),
      input: { ...input, value: 90, disputePrevious: true },
    }),
  );
  // One Dispute: the AI-flagged disputing reading sits in it rather than on a row of its own.
  const dispute = async () =>
    (await listReadingExceptions({ db })).map((row) =>
      row.kind === 'dispute' ? row.dispute.readings.map((reading) => readingExceptionTypes(reading)) : row.kind,
    );
  expect(await dispute()).toEqual([[['disputed'], ['disputed', 'ai-flagged']]]);
  expect(
    await amendHours(db, actor, disputed.id, 90, 'This value is correct; investigate the preceding reading'),
  ).toMatchObject({ disputed: true, evidenceReviewedAt: expect.any(Date) });
  expect(await dispute()).toEqual([[['disputed'], ['disputed']]]);
});

test('retries a delivered mobile capture without creating another reading or disputing a newer one', async ({
  context,
}) => {
  const { db, actor, machineId } = context;
  const input = {
    localId: '8766e188-5041-4d7c-98f2-cbd47dca3c00',
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-08T08:00:00Z',
    disputePrevious: false,
  };
  const { reading: first } = await captureReading({ db, actor, input });
  await captureReading({ db, actor, input: { ...input, localId: undefined, value: 100.5 } });
  const { reading: retry } = await captureReading({ db, actor, input });
  expect(retry.id).toBe(first.id);
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.value)).toEqual([100.5, 100]);
});

test('refuses a Read At more than five minutes ahead, but still replays a stored capture', async ({ context }) => {
  const { db, actor, machineId } = context;
  const now = new Date('2026-10-01T08:00:00Z');
  const input = {
    localId: '0f2b7a64-5d0e-4f43-9b0b-2a7c3e0d9f11',
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-10-01T08:04:00Z',
    disputePrevious: false,
  };
  const { reading: stored } = await captureReading({ db, actor, input, now });
  await expect(
    captureReading({ db, actor, input: { ...input, localId: undefined, capturedAt: '2026-10-01T08:06:00Z' }, now }),
  ).rejects.toMatchObject({ code: 'reading.future_read_at', message: 'Read At cannot be in the future.' });

  const later = new Date('2026-09-30T08:00:00Z');
  expect((await captureReading({ db, actor, input, now: later })).reading.id).toBe(stored.id);
});

test('carries the capture comment through to the Reading Exceptions list', async ({ context }) => {
  const { db, actor, machineId } = context;
  const input = {
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-08T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actor, input });
  const { reading: disputed } = await captureReading({
    db,
    actor,
    input: { ...input, value: 90, disputePrevious: true, comment: '  Meter glass cracked, digits hard to read  ' },
  });
  expect(disputed.comment).toBe('Meter glass cracked, digits hard to read');
  expect((await exceptionReadings(db)).map((row) => [row.id === disputed.id, row.comment])).toEqual([
    [false, null],
    [true, 'Meter glass cracked, digits hard to read'],
  ]);
});

/**
 * A Foreman enters yesterday's reading after today's has landed: it takes its place in time, between its neighbours,
 * and the Machine's latest stays today's. A backdated capture is bounded on both sides, with no dispute path.
 */
test('lands a backdated capture between its time neighbours and keeps the Machine’s latest', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  const spot = (value: number, capturedAt: string, dispute: Partial<ReadingCaptureInput> = {}) =>
    captureReading({
      db,
      actor,
      input: { machineId, role: 'spot', value, capturedAt, disputePrevious: false, ...dispute },
    });
  await patchMachine({ db, actorUserId, input: { id: machineId, nextServiceDueHours: 1050 } });
  await spot(999, '2026-09-07T15:00:00Z');
  const { reading: today } = await spot(1001, '2026-09-08T10:00:00Z');

  const backdated = await spot(1000.5, '2026-09-07T16:00:00Z');
  expect(backdated.serviceDueSoonCrossed).toBe(false);
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.value)).toEqual([1001, 1000.5, 999]);
  expect(await latestReading({ db, machineId })).toMatchObject({ id: today.id, value: 1001 });
  expect(await getMachine({ db, id: machineId })).toMatchObject({
    latestReadingHours: 1001,
    latestReadingAt: '2026-09-08T10:00:00+00:00',
  });

  await expect(spot(1002, '2026-09-07T17:00:00Z')).rejects.toMatchObject({ code: 'reading.above_next' });
  await expect(
    spot(1000, '2026-09-07T17:00:00Z', { disputePrevious: true, expectedPreviousId: today.id }),
  ).rejects.toMatchObject({ code: 'reading.below_latest' });
  expect(await listReadingsByMachine({ db, machineId })).toHaveLength(3);
});

test('refuses a reading on a retired Machine with its code', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  await retireMachine({ db, actorUserId, input: { id: machineId, reason: 'Sold' } });
  await expect(
    captureReading({
      db,
      actor,
      input: { machineId, role: 'spot', value: 10, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
    }),
  ).rejects.toMatchObject({ code: 'reading.retired_machine' });
});

test('reserves a Baseline Reading for Contracting administrators', async ({ context }) => {
  const { db, actor, machineId } = context;
  await expect(
    captureReading({
      db,
      actor,
      input: { machineId, role: 'baseline', value: 10, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
    }),
  ).rejects.toMatchObject({ code: 'reading.forbidden' });
});

test('scopes evidence to fleet readers and the Foreman’s own Jobs', async ({ context }) => {
  const { db, actor, machineId } = context;
  const fixtures = await seedJobFixtures(db);
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
  const stint = await leftStint(db, job.id, fixtures.excavator.id, 100, 110);
  const { reading: unattached } = await captureReading({
    db,
    actor,
    input: { machineId, role: 'spot', value: 5, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
  });

  await expect(getReadingForEvidence({ db, actor: admin, id: unattached.id })).resolves.toMatchObject({
    id: unattached.id,
  });
  await expect(getReadingForEvidence({ db, actor: foreman, id: stint.arrivalReadingId })).resolves.toMatchObject({
    id: stint.arrivalReadingId,
  });
  await expect(getReadingForEvidence({ db, actor: foreman, id: unattached.id })).rejects.toMatchObject({
    code: 'reading.forbidden',
  });
});

test('a background check lands on a pending reading against its current value, and never over a re-verify', async ({
  context,
}) => {
  const { db, actor, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { reverifyReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const input = { machineId, role: 'spot' as const, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false };
  const { reading: captured } = await captureReading({
    db,
    actor,
    evidence: photoEvidence(storage),
    input: { ...input, value: 150 },
  });
  expect(captured).toMatchObject({ aiVerification: 'pending', aiValue: null });
  await amendHours(db, actor, captured.id, 151, 'Typed the wrong tenth');
  const judged = await verifyCapturedReading({
    db,
    id: captured.id,
    storage,
    readPhoto: async () => ({ value: 151, confidence: 0.95 }),
  });
  expect(judged).toMatchObject({ value: 151, aiValue: 151, aiVerification: 'agrees' });
  const [verdictEvent] = await db
    .select({ actorUserId: auditEvents.actorUserId })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityId, captured.id), eq(auditEvents.action, 'updated')))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(1);
  // Nobody asked for the background check, so its verdict is the System's.
  expect(verdictEvent).toEqual({ actorUserId: null });

  const { reading: second } = await captureReading({
    db,
    actor,
    evidence: photoEvidence(storage),
    input: { ...input, value: 160, capturedAt: '2026-09-07T20:00:00Z' },
  });
  const reverified = await reverifyReading({
    db,
    actorUserId,
    id: second.id,
    storage,
    readPhoto: async () => ({ value: 160, confidence: 0.95 }),
  });
  const late = await verifyCapturedReading({
    db,
    id: second.id,
    storage,
    readPhoto: async () => ({ value: 999, confidence: 0.95 }),
  });
  expect(late).toEqual(reverified);

  const { reading: amended } = await captureReading({
    db,
    actor,
    evidence: photoEvidence(storage),
    input: { ...input, value: 170, capturedAt: '2026-09-12T08:00:00Z' },
  });
  await amendHours(db, actor, amended.id, 171, 'Typed the wrong tenth');
  const disagreed = await verifyCapturedReading({
    db,
    id: amended.id,
    storage,
    readPhoto: async () => ({ value: 117, confidence: 0.95 }),
  });
  // An amend made before the AI had looked still leaves its disagreement for Reading Exceptions.
  expect(disagreed).toMatchObject({ value: 171, aiVerification: 'disagrees', evidenceReviewedAt: null });
});

test('crosses the Service Due Soon edge the threshold in Settings draws at capture time', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  const sticker = (nextServiceDueHours: number) =>
    patchMachine({ db, actorUserId, input: { id: machineId, nextServiceDueHours } });
  const capture = (value: number, capturedAt: string) =>
    captureReading({ db, actor, input: { machineId, role: 'spot', value, capturedAt, disputePrevious: false } });
  await sticker(1500);
  expect((await capture(1300, '2026-09-01T08:00:00Z')).serviceDueSoonCrossed).toBe(false);
  // 120 h to go is outside the default 100 h threshold.
  expect((await capture(1380, '2026-09-05T08:00:00Z')).serviceDueSoonCrossed).toBe(false);

  await sticker(2000);
  await updateContractingSettings({
    db,
    actorUserId,
    input: { ...(await getContractingSettings({ db })), serviceDueSoonThresholdHours: 150 },
  });
  // Raising the threshold sends nothing by itself; 120 h to go now crosses at the next capture, once.
  expect((await capture(1880, '2026-09-27T08:00:00Z')).serviceDueSoonCrossed).toBe(true);
  expect((await capture(1881, '2026-09-27T09:00:00Z')).serviceDueSoonCrossed).toBe(false);
});

test('lists each Dispute as one row with its stints, and an AI-flagged reading on its own', async ({ context }) => {
  const { db, actor, machineId: spotMachineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { listReadingExceptions } = await import('./reading-service.js');
  const fixtures = await seedJobFixtures(db);
  const job = () =>
    createJob({
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
  const [first, second] = [await job(), await job()];
  const capture = async (
    jobId: string,
    machineId: string,
    readings: { role: 'arrival' | 'departure'; value: number; capturedAt: string; disputePrevious?: boolean }[],
  ) => {
    const stint = await plannedStint(db, admin, { jobId, machineId, implementId: null });
    const captured = [];
    for (const { disputePrevious = false, ...reading } of readings)
      captured.push(
        (
          await captureReading({
            db,
            actor: foreman,
            input: { machineId, assignmentId: stint.id, disputePrevious, ...reading },
          })
        ).reading,
      );
    return { stint, captured };
  };

  // A Foreman says the previous reading is wrong: a departure on one Job, the next arrival on another.
  const excavator = fixtures.excavator.id;
  const earlier = await capture(first.id, excavator, [
    { role: 'arrival', value: 4700, capturedAt: '2026-09-20T06:00:00Z' },
    { role: 'departure', value: 4728.4, capturedAt: '2026-09-21T16:00:00Z' },
  ]);
  const later = await capture(second.id, excavator, [
    { role: 'arrival', value: 4499.7, capturedAt: '2026-09-22T08:00:00Z', disputePrevious: true },
  ]);

  // John Deere reports more hours than a stint's arrival and departure, both captured after it.
  const tipper = fixtures.tipper.id;
  const contradicted = await capture(first.id, tipper, [
    { role: 'arrival', value: 2906.7, capturedAt: '2026-09-26T15:00:00Z' },
    { role: 'departure', value: 2914.1, capturedAt: '2026-09-27T15:00:00Z' },
  ]);
  const [link] = await db
    .insert(contractingJohnDeereLinks)
    .values({
      machineId: tipper,
      equipmentId: 'eq-1',
      principalId: 1,
      organizationId: '4321',
      deereName: 'Tipper',
      linkedByUserId: actor.userId,
      linkedAt: new Date('2026-09-01T00:00:00Z'),
    })
    .returning();
  if (!link) throw new Error('link insert returned no row');
  await recordTelematicsReading({
    db,
    machineId: tipper,
    linkId: link.id,
    provider: 'john-deere',
    hours: 2927.2,
    reportTime: new Date('2026-09-26T08:09:00Z'),
    now: new Date('2026-09-29T11:52:00Z'),
  });

  const storage = new InMemoryStorageAdapter();
  const flagged = await withBackgroundCheck(
    db,
    storage,
    async () => ({ value: 1234, confidence: 0.95 }),
    captureReading({
      db,
      actor,
      evidence: photoEvidence(storage),
      input: {
        machineId: spotMachineId,
        role: 'spot',
        value: 123.4,
        capturedAt: '2026-09-28T08:00:00Z',
        disputePrevious: false,
      },
    }),
  );

  const stintOf = (stint: { id: string }, jobId: string, arrivedAt: string, departedAt: string | null) => ({
    assignmentId: stint.id,
    jobId,
    jobCode: jobId === first.id ? first.jobNumber : second.jobNumber,
    arrivedAt: new Date(arrivedAt),
    departedAt: departedAt && new Date(departedAt),
  });
  const rows = await listReadingExceptions({ db });
  expect(rows).toMatchObject([
    { kind: 'ai-flagged', reading: { id: flagged.id, stint: null, aiVerification: 'disagrees' } },
    {
      kind: 'dispute',
      dispute: {
        id: contradicted.captured[0]?.id,
        machineCode: 'TIP-7',
        readings: contradicted.captured.map(({ id }) => ({
          id,
          stint: stintOf(contradicted.stint, first.id, '2026-09-26T15:00:00Z', '2026-09-27T15:00:00Z'),
        })),
        reported: { value: 2927.2, capturedAt: new Date('2026-09-26T08:09:00Z'), telematicsProvider: 'john-deere' },
        reason: expect.stringMatching(/^John Deere reported 2\s927\.2\sh at 26 Sep 2026, 10:09\.$/),
      },
    },
    {
      kind: 'dispute',
      dispute: {
        id: earlier.captured[1]?.id,
        machineCode: 'CAT320-1',
        readings: [
          {
            id: earlier.captured[1]?.id,
            stint: stintOf(earlier.stint, first.id, '2026-09-20T06:00:00Z', '2026-09-21T16:00:00Z'),
          },
          { id: later.captured[0]?.id, stint: stintOf(later.stint, second.id, '2026-09-22T08:00:00Z', null) },
        ],
        reported: null,
        reason: PREVIOUS_READING_WRONG,
      },
    },
  ]);
  expect(rows).toHaveLength(3);

  // Each Dispute resolves in one amend; a refusal names the reading it was refused on.
  const resolve = (amendments: { id: string; value: number; capturedAt: string }[]) =>
    amendReadings({ db, actor: admin, input: { amendments, reason: 'Captured late' } });
  const [departure, arrival] = [earlier.captured[1], later.captured[0]];
  if (!departure || !arrival) throw new Error('expected the pair');
  await expect(
    resolve([
      { id: departure.id, value: 4728.4, capturedAt: departure.capturedAt.toISOString() },
      { id: arrival.id, value: 4800, capturedAt: arrival.capturedAt.toISOString() },
    ]),
  ).rejects.toMatchObject({ code: 'reading.outruns_clock', readingId: arrival.id });
  await resolve([
    { id: departure.id, value: 4728.4, capturedAt: departure.capturedAt.toISOString() },
    { id: arrival.id, value: 4728.4, capturedAt: arrival.capturedAt.toISOString() },
  ]);
  await resolve(
    contradicted.captured.map(({ id, value }, index) => ({
      id,
      value,
      capturedAt: ['2026-09-24T10:00:00Z', '2026-09-25T06:00:00Z'][index] as string,
    })),
  );
  expect(await listReadingExceptions({ db })).toMatchObject([{ kind: 'ai-flagged' }]);
});
