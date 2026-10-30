import { contractingJobs, contractingMachines } from '@pkg/db/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from '../fleet/category-service.js';
import { createJob } from '../jobs/job-service.js';
import { setTravelHours } from '../jobs/stint-hours-service.js';
import { captureReading } from '../readings/reading-service.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import { admin, adminId, captureHours, foremanId, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
import { getUtilisationReport, getUtilisationTrend } from './utilisation-service.js';

const today = '2026-10-12' as DateOnlyIso;
const june = { kind: 'month', year: 2026, period: 6 } as const;
const july = { kind: 'month', year: 2026, period: 7 } as const;

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  // Both Machines joined the fleet at the start of the year.
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
  const workedJob = async (arrival: number, departure: number, startDate: string, endDate: string) => {
    const job = await newJob();
    const stint = await plannedStint(db, admin, { jobId: job.id, machineId: fixtures.excavator.id, implementId: null });
    await captureHours(db, stint.id, 'arrival', arrival);
    await captureHours(db, stint.id, 'departure', departure);
    await db.update(contractingJobs).set({ startDate, endDate }).where(eq(contractingJobs.id, job.id));
    return stint.id;
  };
  // The tipper has readings but never a stint, then retired on 10 June.
  await capture(fixtures.tipper.id, 900, '2026-06-02T08:00:00+02:00');
  await capture(fixtures.tipper.id, 912.5, '2026-06-08T08:00:00+02:00');
  await db
    .update(contractingMachines)
    .set({ retiredAt: new Date('2026-06-10T12:00:00+02:00'), retiredReason: 'Sold' })
    .where(eq(contractingMachines.id, fixtures.tipper.id));
  // The excavator: 48.6 h on a Job dated 28 Jun to 3 Jul, then 10 h on one dated 6 to 7 Jul after 8.8 h of Travel.
  await workedJob(4002.6, 4051.2, '2026-06-28', '2026-07-03');
  const secondStintId = await workedJob(4060, 4070, '2026-07-06', '2026-07-07');
  return { ...fixtures, secondStintId };
});

test('derives Active Days from Job dates and spreads Work and Travel over them, across the month boundary', async ({
  context,
}) => {
  const { db } = context;
  const juneReport = await getUtilisationReport({ db, input: june, today });
  const [excavators] = juneReport.categories;
  expect(juneReport.window).toMatchObject({ start: '2026-06-01', end: '2026-06-30', days: 30 });
  expect(excavators?.machines).toEqual([
    expect.objectContaining({
      code: 'CAT320-1',
      activeDays: 3,
      fleetDays: 30,
      utilisationPercent: 10,
      workHours: 24.3,
      travelHours: 0,
    }),
    // Readings but no stint, retired on 10 June: in the window for ten days, never worked, no hours of any kind.
    expect.objectContaining({
      code: 'TIP-7',
      activeDays: 0,
      fleetDays: 10,
      utilisationPercent: 0,
      workHours: 0,
      travelHours: 0,
      retiredDate: '2026-06-10',
    }),
  ]);
  // Day-weighted, never a mean of percentages: 3 active days of 40 fleet days.
  expect(juneReport.fleet).toMatchObject({
    activeDays: 3,
    fleetDays: 40,
    utilisationPercent: 7.5,
    machineCount: 2,
    activeMachineCount: 1,
    fleetLoadPercent: 50,
  });

  const julyReport = await getUtilisationReport({ db, input: july, today });
  expect(julyReport.categories.flatMap((category) => category.machines.map((machine) => machine.code))).toEqual([
    'CAT320-1',
  ]);
  expect(julyReport.fleet).toMatchObject({ activeDays: 5, fleetDays: 31, workHours: 34.3, travelHours: 8.8 });

  await setTravelHours({ db, actor: admin, input: { assignmentId: context.secondStintId, travelHours: 3 } });
  expect((await getUtilisationReport({ db, input: july, today })).fleet).toMatchObject({ travelHours: 3 });
});

test('the trend runs twelve months to the window month for its subject and carries the Settings target', async ({
  context,
}) => {
  const { db } = context;
  const trend = await getUtilisationTrend({ db, input: { window: july, subject: { kind: 'fleet' } }, today });
  expect(trend.months.map((month) => month.month)).toEqual([
    '2025-08-01',
    '2025-09-01',
    '2025-10-01',
    '2025-11-01',
    '2025-12-01',
    '2026-01-01',
    '2026-02-01',
    '2026-03-01',
    '2026-04-01',
    '2026-05-01',
    '2026-06-01',
    '2026-07-01',
  ]);
  expect(trend.months[0]).toMatchObject({ fleetDays: 0, utilisationPercent: null });
  expect(trend.months.at(-1)).toMatchObject({ activeDays: 5, fleetDays: 31 });
  expect(trend).toMatchObject({ label: 'Fleet', utilisationTargetPercent: null });

  const machine = await getUtilisationTrend({
    db,
    input: { window: june, subject: { kind: 'machine', id: context.excavator.id } },
    today,
  });
  expect(machine.label).toBe('CAT320-1');
  expect(machine.months.at(-1)).toMatchObject({ month: '2026-06-01', activeDays: 3, utilisationPercent: 10 });

  await updateContractingSettings({
    db,
    actorUserId: adminId,
    input: { ...(await getContractingSettings({ db })), utilisationTargetPercent: 65 },
  });
  expect(
    (
      await getUtilisationTrend({
        db,
        input: { window: june, subject: { kind: 'category', id: context.category.id } },
        today,
      })
    ).utilisationTargetPercent,
  ).toBe(65);
  await expect(
    getUtilisationTrend({
      db,
      input: { window: june, subject: { kind: 'machine', id: '00000000-0000-4000-8000-000000000000' } },
      today,
    }),
  ).rejects.toMatchObject({ code: 'report.not_found' });
});

test('a Category with no Machines yet names its trend and shows twelve empty months', async ({ context: { db } }) => {
  const tippers = await createCategory({ db, actorUserId: adminId, input: { name: 'Tippers', kind: 'machine' } });
  const trend = await getUtilisationTrend({
    db,
    input: { window: june, subject: { kind: 'category', id: tippers.id } },
    today,
  });
  expect(trend.label).toBe('Tippers');
  expect(trend.months).toHaveLength(12);
  expect(trend.months.every((month) => month.fleetDays === 0 && month.utilisationPercent === null)).toBe(true);
});
