import { user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine } from '../fleet/machine-service.js';
import { createJob } from '../jobs/job-service.js';
import { admin, foreman, foremanId, leftStint, seedJobFixtures } from '../test/job-fixtures.js';
import type { ReadMeterPhoto } from './reading-evidence.js';
import {
  captureReading,
  getReadingForEvidence,
  listReadingsByMachine,
  type ReadingEvidence,
  verifyCapturedReading,
} from './reading-service.js';

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
  const row = await capture;
  return verifyCapturedReading({ db, id: row.id, storage, readPhoto });
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
  const { amendReading, listReadingExceptions } = await import('./reading-service.js');
  const input = {
    machineId,
    role: 'spot' as const,
    value: 1200,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  const previous = await captureReading({ db, actor, input });
  await captureReading({ db, actor, input: { ...input, value: 121, disputePrevious: true } });
  expect((await listReadingExceptions({ db })).map((row) => row.disputed)).toEqual([true, true]);
  await expect(amendReading({ db, actor, input: { id: previous.id, value: 120, reason: ' ' } })).rejects.toThrow();
  await amendReading({ db, actor, input: { id: previous.id, value: 120, reason: 'Tenths drum misread' } });
  expect(await listReadingExceptions({ db })).toEqual([]);
  expect((await listReadingsByMachine({ db, machineId })).find((row) => row.id === previous.id)).toMatchObject({
    value: 120,
    amendedBy: actorUserId,
    amendmentReason: 'Tenths drum misread',
    amendedAt: expect.any(Date),
  });
});

test('keeps photo evidence on AI failure and verifies it later without changing the typed value', async ({
  context,
}) => {
  const { db, actor, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { reverifyReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const row = await withBackgroundCheck(
    db,
    storage,
    async () => {
      throw new Error('Model unavailable');
    },
    captureReading({
      db,
      actor,
      evidence: photoEvidence(storage),
      input: { machineId, role: 'spot', value: 123.4, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
    }),
  );
  expect(row).toMatchObject({
    method: 'photo',
    photo: { contentType: 'image/jpeg' },
    aiVerification: 'pending',
    value: 123.4,
  });
  const reverified = await reverifyReading({
    db,
    actorUserId,
    id: row.id,
    storage,
    readPhoto: async () => ({ value: 123.4, confidence: 0.95 }),
  });
  expect(reverified).toMatchObject({ aiValue: 123.4, aiConfidence: 0.95, aiVerification: 'agrees', value: 123.4 });
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
    [110, 105].map((value) => captureReading({ db, actor, input: { ...input, value } })),
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
  const { amendReading, listReadingExceptions } = await import('./reading-service.js');
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
  await amendReading({ db, actor, input: { id: row.id, value: 120, reason: 'Corrected tenths' } });
  expect(await listReadingExceptions({ db })).toEqual([]);
  const low = await withBackgroundCheck(
    db,
    storage,
    async () => ({ value: 121, confidence: 0.79 }),
    captureReading({ ...args, input: { ...args.input, value: 121 }, evidence: photoEvidence(storage) }),
  );
  expect((await listReadingExceptions({ db }))[0]).toMatchObject({
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
  const { amendReading, listReadingExceptions, reverifyReading } = await import('./reading-service.js');
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
  const amended = await amendReading({
    db,
    actor,
    input: {
      id: reading.id,
      value: 123.4,
      reason: 'Checked the photo: typed value is correct; AI missed the decimal.',
    },
  });
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
  for (const value of [100, 110])
    expect(await captureReading({ db, actor, input: { ...input, value, disputePrevious: true } })).toMatchObject({
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
  const { amendReading, reverifyReading, getReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const row = await captureReading({
    db,
    actor,
    evidence: photoEvidence(storage),
    input: { machineId, role: 'spot', value: 100, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
  });
  const reviewed = await amendReading({
    db,
    actor,
    input: { id: row.id, value: 100, reason: 'The photo confirms 100 hours' },
  });
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
  const { amendReading, listReadingExceptions } = await import('./reading-service.js');
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
  expect((await listReadingExceptions({ db })).map((row) => row.exceptionTypes)).toEqual([
    ['disputed', 'ai-flagged'],
    ['disputed'],
  ]);
  expect(
    await amendReading({
      db,
      actor,
      input: { id: disputed.id, value: 90, reason: 'This value is correct; investigate the preceding reading' },
    }),
  ).toMatchObject({ disputed: true, evidenceReviewedAt: expect.any(Date) });
  expect((await listReadingExceptions({ db })).map((row) => row.exceptionTypes)).toEqual([['disputed'], ['disputed']]);
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
  const first = await captureReading({ db, actor, input });
  await captureReading({ db, actor, input: { ...input, localId: undefined, value: 110 } });
  const retry = await captureReading({ db, actor, input });
  expect(retry.id).toBe(first.id);
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.value)).toEqual([110, 100]);
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
  const stored = await captureReading({ db, actor, input, now });
  await expect(
    captureReading({ db, actor, input: { ...input, localId: undefined, capturedAt: '2026-10-01T08:06:00Z' }, now }),
  ).rejects.toMatchObject({ code: 'reading.future_read_at', message: 'Read At cannot be in the future.' });

  const later = new Date('2026-09-30T08:00:00Z');
  expect((await captureReading({ db, actor, input, now: later })).id).toBe(stored.id);
});

test('a dispute captured against an older reading waits for attention when another reading lands first', async ({
  context,
}) => {
  const { db, actor, machineId } = context;
  const input = {
    machineId,
    role: 'spot' as const,
    value: 200,
    capturedAt: '2026-09-08T08:00:00Z',
    disputePrevious: false,
  };
  const previous = await captureReading({ db, actor, input });
  const newer = await captureReading({ db, actor, input: { ...input, value: 210 } });
  const dispute = { ...input, value: 190, disputePrevious: true, expectedPreviousId: previous.id };
  await expect(captureReading({ db, actor, input: dispute })).rejects.toMatchObject({
    code: 'reading.previous_changed',
  });
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.disputed)).toEqual([false, false]);
  const accepted = await captureReading({ db, actor, input: { ...dispute, expectedPreviousId: newer.id } });
  expect(accepted).toMatchObject({ disputed: true, disputedPreviousId: newer.id });
});

test('carries the capture comment through to the Reading Exceptions list', async ({ context }) => {
  const { db, actor, machineId } = context;
  const { listReadingExceptions } = await import('./reading-service.js');
  const input = {
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-08T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actor, input });
  const disputed = await captureReading({
    db,
    actor,
    input: { ...input, value: 90, disputePrevious: true, comment: '  Meter glass cracked, digits hard to read  ' },
  });
  expect(disputed.comment).toBe('Meter glass cracked, digits hard to read');
  expect((await listReadingExceptions({ db })).map((row) => [row.id === disputed.id, row.comment])).toEqual([
    [true, 'Meter glass cracked, digits hard to read'],
    [false, null],
  ]);
});

/**
 * Two phones on one Machine: the one that captured later reaches the server first. The ledger's order
 * is the dispute trail, so the earlier capture is judged against what the ledger already holds — never
 * re-ordered by a device clock.
 */
test('judges a late-arriving earlier capture against the ledger’s latest, not its own capture time', async ({
  context,
}) => {
  const { db, actor, machineId } = context;
  const spot = { machineId, role: 'spot' as const, disputePrevious: false };
  await captureReading({ db, actor, input: { ...spot, value: 160, capturedAt: '2026-09-08T09:00:00Z' } });

  await expect(
    captureReading({ db, actor, input: { ...spot, value: 150, capturedAt: '2026-09-08T08:00:00Z' } }),
  ).rejects.toMatchObject({ code: 'reading.below_latest' });
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.value)).toEqual([160]);
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
  const unattached = await captureReading({
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
  const { amendReading, reverifyReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const input = { machineId, role: 'spot' as const, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false };
  const captured = await captureReading({
    db,
    actor,
    evidence: photoEvidence(storage),
    input: { ...input, value: 150 },
  });
  expect(captured).toMatchObject({ aiVerification: 'pending', aiValue: null });
  await amendReading({ db, actor, input: { id: captured.id, value: 151, reason: 'Typed the wrong tenth' } });
  const judged = await verifyCapturedReading({
    db,
    id: captured.id,
    storage,
    readPhoto: async () => ({ value: 151, confidence: 0.95 }),
  });
  expect(judged).toMatchObject({ value: 151, aiValue: 151, aiVerification: 'agrees' });

  const second = await captureReading({ db, actor, evidence: photoEvidence(storage), input: { ...input, value: 160 } });
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
});
