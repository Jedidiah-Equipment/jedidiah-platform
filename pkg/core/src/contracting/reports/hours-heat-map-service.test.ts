import { contractingJobs, contractingMachines } from '@pkg/db/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createJob } from '../jobs/job-service.js';
import { captureReading } from '../readings/reading-service.js';
import { admin, captureHours, foremanId, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
import { getHoursHeatMap } from './hours-heat-map-service.js';

const today = '2026-10-12' as DateOnlyIso;
const date = (value: string) => value as DateOnlyIso;

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  await db.update(contractingMachines).set({ createdAt: new Date('2026-01-01T08:00:00+02:00') });
  const newJob = () =>
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
  const capture = (machineId: string, value: number, capturedAt: string) =>
    captureReading({ db, actor: admin, input: { machineId, value, capturedAt } });
  /** A Job on the excavator whose stint arrived and left at these hours, dated as given. */
  const workedJob = async (arrival: number, departure: number | null, startDate: string, endDate: string | null) => {
    const job = await newJob();
    const stint = await plannedStint(db, admin, { jobId: job.id, machineId: fixtures.excavator.id, implementId: null });
    await captureHours(db, stint.id, 'arrival', arrival);
    if (departure !== null) await captureHours(db, stint.id, 'departure', departure);
    await db.update(contractingJobs).set({ startDate, endDate }).where(eq(contractingJobs.id, job.id));
    return job.id;
  };
  // The tipper: two spot readings six days apart, 12.5 h between them, then retired.
  await capture(fixtures.tipper.id, 900, '2026-06-02T08:00:00+02:00');
  await capture(fixtures.tipper.id, 912.5, '2026-06-08T08:00:00+02:00');
  await db
    .update(contractingMachines)
    .set({ retiredAt: new Date('2026-06-10T12:00:00+02:00'), retiredReason: 'Sold' })
    .where(eq(contractingMachines.id, fixtures.tipper.id));
  // The excavator's ledger: read 28 Jun, 30 Jun and 3 Jul, an 8.8 h gap, then 6 and 7 Jul.
  const excavator = fixtures.excavator.id;
  await capture(excavator, 4002.6, '2026-06-28T09:00:00+02:00');
  await capture(excavator, 4030.0, '2026-06-30T18:00:00+02:00');
  await capture(excavator, 4051.2, '2026-07-03T12:00:00+02:00');
  await capture(excavator, 4060.0, '2026-07-06T08:00:00+02:00');
  await capture(excavator, 4070.0, '2026-07-07T08:00:00+02:00');
  // Job A worked 48.6 h dated 28 Jun to 3 Jul; Job B 10 h dated 6 to 7 Jul.
  const jobA = await workedJob(4002.6, 4051.2, '2026-06-28', '2026-07-03');
  const jobB = await workedJob(4060, 4070, '2026-07-06', '2026-07-07');
  return { ...fixtures, capture, workedJob, jobA, jobB };
});

const hoursOn = (heatMap: Awaited<ReturnType<typeof getHoursHeatMap>>, day: string) =>
  heatMap.days.find((entry) => entry.date === day);
const total = (heatMap: Awaited<ReturnType<typeof getHoursHeatMap>>) =>
  heatMap.days.reduce((sum, day) => sum + day.hours, 0);

test('spreads a Machine’s reading delta over the days between its readings and marks them estimated', async ({
  context,
}) => {
  const { db, tipper } = context;
  const heatMap = await getHoursHeatMap({
    db,
    input: { machineIds: [tipper.id], start: date('2026-06-01'), end: date('2026-06-10') },
    today,
  });
  // 12.5 h over the 144 elapsed hours from 2 Jun 08:00 to 8 Jun 08:00, by plant day.
  expect(heatMap.days.map((day) => day.hours)).toEqual([0, 1.4, 2.1, 2.1, 2.1, 2.1, 2.1, 0.7, 0, 0]);
  expect(hoursOn(heatMap, '2026-06-05')).toEqual({ date: '2026-06-05', hours: 2.1, estimated: true });
  expect(hoursOn(heatMap, '2026-06-01')).toEqual({ date: '2026-06-01', hours: 0, estimated: false });
});

test('counts every meter hour for a Machine, the gap between its Jobs included, and zero-fills the other days', async ({
  context,
}) => {
  const { db, excavator } = context;
  const heatMap = await getHoursHeatMap({
    db,
    input: { machineIds: [excavator.id], start: date('2026-06-27'), end: date('2026-07-08') },
    today,
  });
  expect(heatMap.days).toHaveLength(12);
  expect(hoursOn(heatMap, '2026-06-27')?.hours).toBe(0);
  expect(hoursOn(heatMap, '2026-06-28')?.hours).toBe(7.2);
  // 8 h of the 8.8 h gap and 16 of the 24 h of the 10 h second stint.
  expect(hoursOn(heatMap, '2026-07-06')?.hours).toBe(7.7);
  expect(hoursOn(heatMap, '2026-07-08')?.hours).toBe(0);
  expect(Math.abs(total(heatMap) - 67.4)).toBeLessThan(0.6);
});

test('opens the first day from the reading before the range and ends the last on the one after it', async ({
  context,
}) => {
  const { db, excavator } = context;
  // 30 Jun 18:00 (4030.0) to 3 Jul 12:00 (4051.2) is 21.2 h over 66 elapsed hours; the range holds 1 and 2 July only.
  const heatMap = await getHoursHeatMap({
    db,
    input: { machineIds: [excavator.id], start: date('2026-07-01'), end: date('2026-07-02') },
    today,
  });
  expect(heatMap.days).toEqual([
    { date: '2026-07-01', hours: 7.7, estimated: true },
    { date: '2026-07-02', hours: 7.7, estimated: true },
  ]);
});

test('sums every Machine, retired ones included, when nothing is filtered, and treats empty arrays as nothing', async ({
  context,
}) => {
  const { db } = context;
  const input = { start: date('2026-06-02'), end: date('2026-06-02') };
  const everything = await getHoursHeatMap({ db, input, today });
  expect(everything.days).toEqual([{ date: '2026-06-02', hours: 1.4, estimated: true }]);
  expect(await getHoursHeatMap({ db, input: { ...input, machineIds: [], jobIds: [] }, today })).toEqual(everything);
});

test('spreads a Job’s Work hours evenly over its dates under a Job filter', async ({ context }) => {
  const { db, jobA, jobB } = context;
  const range = { start: date('2026-06-27'), end: date('2026-07-08') };
  const a = await getHoursHeatMap({ db, input: { ...range, jobIds: [jobA] }, today });
  expect(hoursOn(a, '2026-06-28')).toEqual({ date: '2026-06-28', hours: 8.1, estimated: true });
  expect(hoursOn(a, '2026-07-05')?.hours).toBe(0);
  expect(total(a)).toBeCloseTo(48.6, 1);
  const b = await getHoursHeatMap({ db, input: { ...range, jobIds: [jobB] }, today });
  expect([hoursOn(b, '2026-07-06')?.hours, hoursOn(b, '2026-07-07')?.hours]).toEqual([5, 5]);
  const both = await getHoursHeatMap({ db, input: { ...range, jobIds: [jobA, jobB] }, today });
  expect(total(both)).toBeCloseTo(58.6, 1);
});

test('intersects Machines and Jobs, so a Machine that never worked the Job shows nothing', async ({ context }) => {
  const { db, jobA, tipper, excavator } = context;
  const range = { start: date('2026-06-27'), end: date('2026-07-08') };
  expect(
    total(await getHoursHeatMap({ db, input: { ...range, jobIds: [jobA], machineIds: [tipper.id] }, today })),
  ).toBe(0);
  expect(
    total(await getHoursHeatMap({ db, input: { ...range, jobIds: [jobA], machineIds: [excavator.id] }, today })),
  ).toBeCloseTo(48.6, 1);
});

test('a stint still on site has no Work hours to spread yet', async ({ context }) => {
  const { db, workedJob } = context;
  const open = await workedJob(4070, null, '2026-07-10', null);
  const heatMap = await getHoursHeatMap({
    db,
    input: { jobIds: [open], start: date('2026-07-09'), end: date('2026-07-11') },
    today,
  });
  expect(heatMap.days.map((day) => day.hours)).toEqual([0, 0, 0]);
});

test('reads hourly readings on one day as exact', async ({ context }) => {
  const { db, excavator, capture } = context;
  await capture(excavator.id, 4070, '2026-07-12T08:00:00+02:00');
  await capture(excavator.id, 4071.5, '2026-07-12T09:00:00+02:00');
  await capture(excavator.id, 4073, '2026-07-12T10:30:00+02:00');
  const heatMap = await getHoursHeatMap({
    db,
    input: { machineIds: [excavator.id], start: date('2026-07-12'), end: date('2026-07-12') },
    today,
  });
  expect(heatMap.days).toEqual([{ date: '2026-07-12', hours: 3, estimated: false }]);
});

test('defaults to the six months ending today and refuses ranges that run backwards or span over a year', async ({
  context,
}) => {
  const { db } = context;
  const heatMap = await getHoursHeatMap({ db, input: {}, today });
  expect(heatMap.start).toBe('2026-04-12');
  expect(heatMap.end).toBe('2026-10-12');
  expect(heatMap.days).toHaveLength(184);
  expect((await getHoursHeatMap({ db, input: { end: date('2027-01-01') }, today })).end).toBe('2026-10-12');
  await expect(
    getHoursHeatMap({ db, input: { start: date('2026-10-12'), end: date('2026-10-01') }, today }),
  ).rejects.toMatchObject({ code: 'report.invalid_range' });
  expect(await getHoursHeatMap({ db, input: { start: date('2026-12-01') }, today })).toMatchObject({ days: [] });
  await expect(getHoursHeatMap({ db, input: { start: date('2025-01-01') }, today })).rejects.toMatchObject({
    code: 'report.invalid_range',
  });
});
