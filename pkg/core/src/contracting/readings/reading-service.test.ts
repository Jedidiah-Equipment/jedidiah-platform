import { user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine, getMachine, patchMachine, retireMachine } from '../fleet/machine-service.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import { amendHours } from '../test/job-fixtures.js';
import { captureReading, latestReading, listReadingsByMachine } from './reading-service.js';

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

test('amends a spot reading with a reason, audited, and refuses one outside its neighbours', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  const spot = (value: number, capturedAt: string) =>
    captureReading({ db, actor, input: { machineId, value, capturedAt } });
  await spot(100, '2026-09-06T08:00:00Z');
  const { reading: previous } = await spot(112, '2026-09-07T08:00:00Z');
  await spot(120, '2026-09-08T08:00:00Z');
  await expect(amendHours(db, actor, previous.id, 110, ' ')).rejects.toThrow();
  await expect(amendHours(db, actor, previous.id, 121, 'Misread')).rejects.toMatchObject({
    code: 'reading.invalid_amendment',
    refusal: { readingId: previous.id },
  });
  await amendHours(db, actor, previous.id, 110, 'Tenths drum misread');
  expect((await listReadingsByMachine({ db, machineId })).find((row) => row.id === previous.id)).toMatchObject({
    value: 110,
    amendedBy: actorUserId,
    amendmentReason: 'Tenths drum misread',
    amendedAt: expect.any(Date),
  });
});

test('refuses a spot reading below the latest with no other way forward', async ({ context }) => {
  const { db, actor, machineId } = context;
  await captureReading({ db, actor, input: { machineId, value: 100, capturedAt: '2026-09-07T08:00:00Z' } });
  await expect(
    captureReading({ db, actor, input: { machineId, value: 90, capturedAt: '2026-09-07T09:00:00Z' } }),
  ).rejects.toMatchObject({ code: 'reading.below_latest', message: 'Reading is below the latest reading.' });
});

test('serializes competing captures and preserves the ledger when an insert fails', async ({ context }) => {
  const { db, actor, machineId } = context;
  const input = { machineId, value: 100, capturedAt: '2026-09-07T08:00:00Z' };
  await captureReading({ db, actor, input });
  const results = await Promise.allSettled(
    [110, 105].map((value) =>
      captureReading({ db, actor, input: { ...input, value, capturedAt: '2026-09-08T08:00:00Z' } }),
    ),
  );
  expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
  const history = await listReadingsByMachine({ db, machineId });
  expect(history.every((row, i) => !history[i + 1] || row.value >= (history[i + 1]?.value ?? 0))).toBe(true);
  await expect(captureReading({ db, actor, input: { ...input, value: 90 } })).rejects.toMatchObject({
    code: 'reading.below_latest',
  });
  expect(await listReadingsByMachine({ db, machineId })).toEqual(history);
});

test('retries a delivered mobile capture without creating another reading', async ({ context }) => {
  const { db, actor, machineId } = context;
  const input = {
    localId: '8766e188-5041-4d7c-98f2-cbd47dca3c00',
    machineId,
    value: 100,
    capturedAt: '2026-09-08T08:00:00Z',
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
    value: 100,
    capturedAt: '2026-10-01T08:04:00Z',
  };
  const { reading: stored } = await captureReading({ db, actor, input, now });
  await expect(
    captureReading({ db, actor, input: { ...input, localId: undefined, capturedAt: '2026-10-01T08:06:00Z' }, now }),
  ).rejects.toMatchObject({ code: 'reading.future_read_at', message: 'Read At cannot be in the future.' });

  const later = new Date('2026-09-30T08:00:00Z');
  expect((await captureReading({ db, actor, input, now: later })).reading.id).toBe(stored.id);
});

test('keeps the capture comment, trimmed', async ({ context }) => {
  const { db, actor, machineId } = context;
  const { reading } = await captureReading({
    db,
    actor,
    input: { machineId, value: 100, capturedAt: '2026-09-08T08:00:00Z', comment: '  Meter glass cracked  ' },
  });
  expect(reading.comment).toBe('Meter glass cracked');
});

/**
 * A Foreman enters yesterday's reading after today's has landed: it takes its place in time, between its neighbours,
 * and the Machine's latest stays today's. A backdated capture is bounded on both sides.
 */
test('lands a backdated capture between its time neighbours and keeps the Machine’s latest', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  const spot = (value: number, capturedAt: string) =>
    captureReading({ db, actor, input: { machineId, value, capturedAt } });
  await patchMachine({ db, actorUserId, input: { id: machineId, nextServiceDueHours: 1050 } });
  await spot(999, '2026-09-07T15:00:00Z');
  const { reading: today } = await spot(1001, '2026-09-08T10:00:00Z');

  const backdated = await spot(1000.5, '2026-09-07T16:00:00Z');
  expect(backdated.serviceDueSoonCrossed).toBe(false);
  expect((await listReadingsByMachine({ db, machineId })).map((row) => row.value)).toEqual([1001, 1000.5, 999]);
  expect(await latestReading({ db, machineId })).toMatchObject({ id: today.id, value: 1001 });
  expect(await getMachine({ db, id: machineId })).toMatchObject({
    knownHours: 1001,
    knownHoursAt: '2026-09-08T10:00:00+00:00',
    knownHoursSource: 'spot',
  });

  await expect(spot(1002, '2026-09-07T17:00:00Z')).rejects.toMatchObject({ code: 'reading.above_next' });
  await expect(spot(1000, '2026-09-07T17:00:00Z')).rejects.toMatchObject({ code: 'reading.below_latest' });
  expect(await listReadingsByMachine({ db, machineId })).toHaveLength(3);
});

test('refuses a reading on a retired Machine with its code', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  await retireMachine({ db, actorUserId, input: { id: machineId, reason: 'Sold' } });
  await expect(
    captureReading({
      db,
      actor,
      input: { machineId, value: 10, capturedAt: '2026-09-07T08:00:00Z' },
    }),
  ).rejects.toMatchObject({ code: 'reading.retired_machine' });
});

test('crosses the Service Due Soon edge the threshold in Settings draws at capture time', async ({ context }) => {
  const { db, actor, actorUserId, machineId } = context;
  const sticker = (nextServiceDueHours: number) =>
    patchMachine({ db, actorUserId, input: { id: machineId, nextServiceDueHours } });
  const capture = (value: number, capturedAt: string) =>
    captureReading({ db, actor, input: { machineId, value, capturedAt } });
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
