import { user } from '@pkg/db';
import { contractingJohnDeereLinks } from '@pkg/db/contracting';
import { PREVIOUS_READING_WRONG } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { MachineCreateInput, type ReadingCaptureInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine, getMachine, patchMachine, retireMachine } from '../fleet/machine-service.js';
import { createJob } from '../jobs/job-service.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import {
  admin,
  amendHours,
  disputedReadings,
  foreman,
  foremanId,
  plannedStint,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import {
  amendReadings,
  captureReading,
  latestReading,
  listDisputes,
  listReadingsByMachine,
} from './reading-service.js';
import { recordTelematicsReading } from './telematics-reading.js';

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
  const input = {
    machineId,
    role: 'spot' as const,
    value: 1200,
    capturedAt: '2026-09-07T08:00:00Z',
    disputePrevious: false,
  };
  const { reading: previous } = await captureReading({ db, actor, input });
  await captureReading({ db, actor, input: { ...input, value: 121, disputePrevious: true } });
  expect((await disputedReadings(db)).map((row) => row.disputed)).toEqual([true, true]);
  await expect(amendHours(db, actor, previous.id, 120, ' ')).rejects.toThrow();
  await amendHours(db, actor, previous.id, 120, 'Tenths drum misread');
  expect(await listDisputes({ db })).toEqual([]);
  expect((await listReadingsByMachine({ db, machineId })).find((row) => row.id === previous.id)).toMatchObject({
    value: 120,
    amendedBy: actorUserId,
    amendmentReason: 'Tenths drum misread',
    amendedAt: expect.any(Date),
  });
});

test('serializes competing captures and preserves the ledger when an insert fails', async ({ context }) => {
  const { db, actor, machineId } = context;
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
  await expect(captureReading({ db, actor, input: { ...input, value: 90 } })).rejects.toMatchObject({
    code: 'reading.below_latest',
  });
  expect(await listReadingsByMachine({ db, machineId })).toEqual(history);
});

test('ignores a stale dispute flag on equal and increasing captures', async ({ context }) => {
  const { db, actor, machineId } = context;
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
  expect(await listDisputes({ db })).toEqual([]);
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

test('carries the capture comment through to Disputes', async ({ context }) => {
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
  expect((await disputedReadings(db)).map((row) => [row.id === disputed.id, row.comment])).toEqual([
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

test('lists each Dispute as one row with its stints, and never a reading that is not Disputed', async ({ context }) => {
  const { db, actor, machineId: spotMachineId } = context;
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

  // A reading nothing disputes stays off the list.
  await captureReading({
    db,
    actor,
    input: {
      machineId: spotMachineId,
      role: 'spot',
      value: 123.4,
      capturedAt: '2026-09-28T08:00:00Z',
      disputePrevious: false,
    },
  });

  const stintOf = (stint: { id: string }, jobId: string, arrivedAt: string, departedAt: string | null) => ({
    assignmentId: stint.id,
    jobId,
    jobNumber: jobId === first.id ? first.jobNumber : second.jobNumber,
    arrivedAt: new Date(arrivedAt),
    departedAt: departedAt && new Date(departedAt),
  });
  const rows = await listDisputes({ db });
  expect(rows).toMatchObject([
    {
      id: contradicted.captured[0]?.id,
      machineCode: 'TIP-7',
      readings: contradicted.captured.map(({ id }) => ({
        id,
        stint: stintOf(contradicted.stint, first.id, '2026-09-26T15:00:00Z', '2026-09-27T15:00:00Z'),
      })),
      reported: { value: 2927.2, capturedAt: new Date('2026-09-26T08:09:00Z'), telematicsProvider: 'john-deere' },
      reason: expect.stringMatching(/^John Deere reported 2\s927\.2\sh at 26 Sep 2026, 10:09\.$/),
    },
    {
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
  ]);
  expect(rows).toHaveLength(2);

  // Each Dispute resolves in one amend; a refusal names the reading it was refused on.
  const resolve = (amendments: { id: string; value: number; capturedAt: string }[]) =>
    amendReadings({ db, actor: admin, input: { amendments, reason: 'Captured late' } });
  const arrival = later.captured[0];
  if (!arrival) throw new Error('expected the pair');
  await expect(
    resolve([{ id: arrival.id, value: 4800, capturedAt: arrival.capturedAt.toISOString() }]),
  ).rejects.toMatchObject({ code: 'reading.outruns_clock', refusal: { readingId: arrival.id } });
  await resolve([{ id: arrival.id, value: 4728.4, capturedAt: arrival.capturedAt.toISOString() }]);
  await resolve(
    contradicted.captured.map(({ id, value }, index) => ({
      id,
      value,
      capturedAt: ['2026-09-24T10:00:00Z', '2026-09-25T06:00:00Z'][index] as string,
    })),
  );
  expect(await listDisputes({ db })).toEqual([]);
});
