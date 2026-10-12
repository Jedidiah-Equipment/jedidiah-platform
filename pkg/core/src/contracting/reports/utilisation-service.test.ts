import { contractingMachines } from '@pkg/db/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { resolveGap } from '../jobs/assignment-service.js';
import { createJob } from '../jobs/job-service.js';
import { captureReading } from '../readings/reading-service.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import { admin, adminId, foreman, foremanId, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
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
  const capture = (
    machineId: string,
    role: 'arrival' | 'departure' | 'spot',
    value: number,
    capturedAt: string,
    assignmentId?: string,
  ) =>
    captureReading({
      db,
      actor: role === 'spot' ? admin : foreman,
      input: {
        machineId,
        ...(assignmentId ? { assignmentId } : {}),
        role,
        value,
        capturedAt,
        disputePrevious: false,
        ...(role === 'departure' ? { comment: 'Photo unavailable' } : {}),
      },
    });
  // The tipper has readings but never a stint, then retired on 10 June.
  await capture(fixtures.tipper.id, 'spot', 900, '2026-06-02T08:00:00+02:00');
  await capture(fixtures.tipper.id, 'spot', 912.5, '2026-06-08T08:00:00+02:00');
  await db
    .update(contractingMachines)
    .set({ retiredAt: new Date('2026-06-10T12:00:00+02:00'), retiredReason: 'Sold' })
    .where(eq(contractingMachines.id, fixtures.tipper.id));
  // The excavator: on site 28 Jun to 3 Jul with a spot read on 30 Jun, then an 8.8 h gap, then 6 to 7 Jul.
  const excavator = fixtures.excavator.id;
  const first = await plannedStint(db, admin, { jobId: (await newJob()).id, machineId: excavator, implementId: null });
  await capture(excavator, 'arrival', 4002.6, '2026-06-28T09:00:00+02:00', first.id);
  await capture(excavator, 'spot', 4030.0, '2026-06-30T18:00:00+02:00');
  await capture(excavator, 'departure', 4051.2, '2026-07-03T12:00:00+02:00', first.id);
  const second = await plannedStint(db, admin, { jobId: (await newJob()).id, machineId: excavator, implementId: null });
  await capture(excavator, 'arrival', 4060.0, '2026-07-06T08:00:00+02:00', second.id);
  await capture(excavator, 'departure', 4070.0, '2026-07-07T08:00:00+02:00', second.id);
  return { ...fixtures, secondStintId: second.id };
});

test('derives day counts and hours by kind from the captured ledger, pro-rated across the month boundary', async ({
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
      workHours: 29.3,
      travelHours: 0,
      unresolvedHours: 0,
    }),
    // Readings but no stint, retired on 10 June: in the window for ten days, never worked, no hours of any kind.
    expect.objectContaining({
      code: 'TIP-7',
      activeDays: 0,
      fleetDays: 10,
      utilisationPercent: 0,
      workHours: 0,
      travelHours: 0,
      unaccountedHours: 0,
      unresolvedHours: 0,
      retiredAt: expect.any(String),
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
  expect(julyReport.fleet).toMatchObject({ activeDays: 5, fleetDays: 31, workHours: 29.3, unresolvedHours: 8.8 });

  await resolveGap({
    db,
    actor: admin,
    input: { id: context.secondStintId, travelHours: 3, unaccountedHours: 5.8, reason: 'Yard work' },
  });
  expect((await getUtilisationReport({ db, input: july, today })).fleet).toMatchObject({
    travelHours: 3,
    unaccountedHours: 5.8,
    unresolvedHours: 0,
  });
});

test('the trend runs twelve months to the window month for its subject and carries the Settings target', async ({
  context,
}) => {
  const { db } = context;
  const trend = await getUtilisationTrend({ db, input: { window: july, subject: { kind: 'fleet' } }, today });
  expect(trend.months.map((month) => month.month)).toEqual([
    '2025-08',
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
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
  expect(machine.months.at(-1)).toMatchObject({ month: '2026-06', activeDays: 3, utilisationPercent: 10 });

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
