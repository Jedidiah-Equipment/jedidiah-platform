import { user } from '@pkg/db';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine } from '../fleet/machine-service.js';
import { captureReading, listReadingsByMachine } from './reading-service.js';

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
  const category = await createCategory({ db, actorUserId, input: { name: 'Tractors' } });
  const machine = await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({ code: 'T1', make: 'Deere', model: '6140', categoryId: category.id }),
  });
  return { actorUserId, machineId: machine.id };
});

test('refuses a spot below the latest reading but accepts an idle machine with equal hours', async ({ context }) => {
  const { db, actorUserId, machineId } = context;
  const input = {
    machineId,
    role: 'baseline' as const,
    value: 120.5,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actorUserId, input });
  await expect(
    captureReading({ db, actorUserId, input: { ...input, role: 'spot', value: 120.4 } }),
  ).rejects.toMatchObject({ code: 'reading.below_latest' });
  await captureReading({ db, actorUserId, input: { ...input, role: 'spot' } });
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.value)).toEqual([120.5, 120.5]);
});

test('flags both disputed readings and clears the resolved pair with an audited amendment', async ({ context }) => {
  const { db, actorUserId, machineId } = context;
  const { amendReading, listReadingExceptions } = await import('./reading-service.js');
  const input = {
    machineId,
    role: 'spot' as const,
    value: 1200,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  const previous = await captureReading({ db, actorUserId, input });
  await captureReading({ db, actorUserId, input: { ...input, value: 121, disputePrevious: true } });
  expect((await listReadingExceptions({ db })).map((row) => row.disputed)).toEqual([true, true]);
  await expect(
    amendReading({ db, actorUserId, input: { id: previous.id, value: 120, reason: ' ' } }),
  ).rejects.toThrow();
  await amendReading({ db, actorUserId, input: { id: previous.id, value: 120, reason: 'Tenths drum misread' } });
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
  const { db, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { reverifyReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const row = await captureReading({
    db,
    actorUserId,
    storage,
    photoBytes: new Uint8Array([255, 216, 255]),
    readPhoto: async () => {
      throw new Error('Model unavailable');
    },
    input: { machineId, role: 'spot', value: 123.4, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
  });
  expect(row).toMatchObject({
    method: 'photo',
    photo: { contentType: 'image/jpeg' },
    aiVerification: 'pending',
    value: 123.4,
  });
  const verified = await reverifyReading({
    db,
    actorUserId,
    id: row.id,
    storage,
    readPhoto: async () => ({ value: 123.4, confidence: 0.95 }),
  });
  expect(verified).toMatchObject({ aiValue: 123.4, aiConfidence: 0.95, aiVerification: 'agrees', value: 123.4 });
});

test('serializes competing captures and preserves the ledger when an upload or insert fails', async ({ context }) => {
  const { db, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const storage = new InMemoryStorageAdapter();
  const input = {
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actorUserId, input });
  const results = await Promise.allSettled(
    [110, 105].map((value) => captureReading({ db, actorUserId, input: { ...input, value } })),
  );
  expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
  const history = await listReadingsByMachine({ db, machineId });
  expect(history.every((row, i) => !history[i + 1] || row.value >= (history[i + 1]?.value ?? 0))).toBe(true);
  await expect(
    captureReading({
      db,
      actorUserId,
      input: { ...input, value: 90 },
      storage,
      photoBytes: new Uint8Array([255, 216, 255]),
      readPhoto: async () => ({ value: 90, confidence: 0.9 }),
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
      actorUserId,
      input: { ...input, value: 120 },
      storage: brokenStorage,
      photoBytes: new Uint8Array([255, 216, 255]),
      readPhoto: async () => ({ value: 120, confidence: 0.9 }),
    }),
  ).rejects.toThrow('Storage unavailable');
  expect(await listReadingsByMachine({ db, machineId })).toEqual(history);
});

test('surfaces disagreements and low confidence and recalculates verification after amendment', async ({ context }) => {
  const { db, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { amendReading, listReadingExceptions } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const args = {
    db,
    actorUserId,
    storage,
    photoBytes: new Uint8Array([255, 216, 255]),
    input: {
      machineId,
      role: 'spot' as const,
      value: 1200,
      capturedAt: '2026-09-07T08:00:00Z',
      disputePrevious: false,
    },
  };
  const row = await captureReading({ ...args, readPhoto: async () => ({ value: 120, confidence: 0.9 }) });
  expect(row).toMatchObject({ aiVerification: 'disagrees', aiHint: 'Possible tenths-drum misread (≈10× / 0.1×).' });
  await amendReading({ db, actorUserId, input: { id: row.id, value: 120, reason: 'Corrected tenths' } });
  expect(await listReadingExceptions({ db })).toEqual([]);
  const low = await captureReading({
    ...args,
    input: { ...args.input, value: 121 },
    readPhoto: async () => ({ value: 121, confidence: 0.79 }),
  });
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
  const { db, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { amendReading, listReadingExceptions, reverifyReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const readPhoto = async () => ({ value: 1234, confidence: 0.6 });
  const reading = await captureReading({
    db,
    actorUserId,
    storage,
    readPhoto,
    photoBytes: new Uint8Array([255, 216, 255]),
    input: { machineId, role: 'spot', value: 123.4, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
  });
  expect((await listReadingExceptions({ db })).length).toBe(1);
  const amended = await amendReading({
    db,
    actorUserId,
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
  const { db, actorUserId, machineId } = context;
  const { listReadingExceptions } = await import('./reading-service.js');
  const input = {
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actorUserId, input });
  for (const value of [100, 110])
    expect(await captureReading({ db, actorUserId, input: { ...input, value, disputePrevious: true } })).toMatchObject({
      disputed: false,
      disputedPreviousId: null,
    });
  expect(await listReadingExceptions({ db })).toEqual([]);
});

test('failed re-verification preserves the previous AI evidence and its management acknowledgement', async ({
  context,
}) => {
  const { db, actorUserId, machineId } = context;
  const { InMemoryStorageAdapter } = await import('../../storage/in-memory-storage-adapter.js');
  const { amendReading, reverifyReading, getReading } = await import('./reading-service.js');
  const storage = new InMemoryStorageAdapter();
  const row = await captureReading({
    db,
    actorUserId,
    storage,
    photoBytes: new Uint8Array([255, 216, 255]),
    readPhoto: async () => ({ value: 1000, confidence: 0.6 }),
    input: { machineId, role: 'spot', value: 100, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
  });
  const reviewed = await amendReading({
    db,
    actorUserId,
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
  const { db, actorUserId, machineId } = context;
  const { amendReading, listReadingExceptions } = await import('./reading-service.js');
  const input = {
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  await captureReading({ db, actorUserId, input });
  const disputed = await captureReading({ db, actorUserId, input: { ...input, value: 90, disputePrevious: true } });
  expect(
    await amendReading({
      db,
      actorUserId,
      input: { id: disputed.id, value: 90, reason: 'This value is correct; investigate the preceding reading' },
    }),
  ).toMatchObject({ disputed: true, evidenceReviewedAt: expect.any(Date) });
  expect((await listReadingExceptions({ db })).length).toBe(2);
});

test('retries a delivered mobile capture without creating another reading or disputing a newer one', async ({
  context,
}) => {
  const { db, actorUserId, machineId } = context;
  const input = {
    localId: '8766e188-5041-4d7c-98f2-cbd47dca3c00',
    machineId,
    role: 'spot' as const,
    value: 100,
    capturedAt: '2026-09-08T08:00:00Z',
    disputePrevious: false,
  };
  const first = await captureReading({ db, actorUserId, input });
  await captureReading({ db, actorUserId, input: { ...input, localId: undefined, value: 110 } });
  const retry = await captureReading({ db, actorUserId, input });
  expect(retry.id).toBe(first.id);
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.value)).toEqual([110, 100]);
});

test('a dispute captured against an older reading waits for attention when another reading lands first', async ({
  context,
}) => {
  const { db, actorUserId, machineId } = context;
  const input = {
    machineId,
    role: 'spot' as const,
    value: 200,
    capturedAt: '2026-09-08T08:00:00Z',
    disputePrevious: false,
  };
  const previous = await captureReading({ db, actorUserId, input });
  const newer = await captureReading({ db, actorUserId, input: { ...input, value: 210 } });
  const dispute = { ...input, value: 190, disputePrevious: true, expectedPreviousId: previous.id };
  await expect(captureReading({ db, actorUserId, input: dispute })).rejects.toMatchObject({
    code: 'reading.previous_changed',
  });
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.disputed)).toEqual([false, false]);
  const accepted = await captureReading({ db, actorUserId, input: { ...dispute, expectedPreviousId: newer.id } });
  expect(accepted).toMatchObject({ disputed: true, disputedPreviousId: newer.id });
});
