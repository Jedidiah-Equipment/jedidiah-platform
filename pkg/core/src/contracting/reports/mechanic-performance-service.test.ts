import { user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import type { DateOnlyIso } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { assignMechanic, reportBreakdown, solveBreakdown, startBreakdown } from '../breakdowns/breakdown-service.js';
import { seedJobFixtures } from '../test/job-fixtures.js';
import { getMechanicPerformance } from './mechanic-performance-service.js';

const today = '2026-10-12' as DateOnlyIso;
const june = { kind: 'month', year: 2026, period: 6 } as const;
const may = { kind: 'month', year: 2026, period: 5 } as const;
const workshop = accessForRole('workshop-manager', 'connor');

const test = createTester(async ({ db }) => {
  const { excavator } = await seedJobFixtures(db);
  const now = new Date();
  const person = (id: string, name: string, contractingRole: 'workshop-manager' | 'mechanic') => ({
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
      person('anele', 'Anele', 'mechanic'),
      person('bongani', 'Bongani', 'mechanic'),
      person('pieter', 'Pieter', 'mechanic'),
    ]);
  const breakdown = async (reportedAt: string, mechanic: string | null) => {
    const { breakdown } = await reportBreakdown({
      db,
      actor: workshop,
      input: { subject: { kind: 'machine', id: excavator.id }, urgency: 'code-green', description: 'Leaking seal' },
      now: new Date(reportedAt),
    });
    if (mechanic) await assignMechanic({ db, actor: workshop, input: { id: breakdown.id, mechanicUserId: mechanic } });
    return breakdown.id;
  };
  const solve = (id: string, at: string) =>
    solveBreakdown({ db, actor: workshop, input: { id, closeOutNote: 'Seal replaced' }, now: new Date(at) });

  // Anele: solved 0.8 days (19.2 h) after report in June, one solved in May, one in progress now.
  await solve(await breakdown('2026-06-10T08:00:00+02:00', 'anele'), '2026-06-11T03:12:00+02:00');
  await solve(await breakdown('2026-05-20T08:00:00+02:00', 'anele'), '2026-05-25T08:00:00+02:00');
  await startBreakdown({ db, actor: workshop, id: await breakdown('2026-10-01T08:00:00+02:00', 'anele') });
  // Pieter solved one in June and was later moved out of the Mechanic set: his history keeps his row.
  await solve(await breakdown('2026-06-01T08:00:00+02:00', 'pieter'), '2026-06-03T08:00:00+02:00');
  await db.update(user).set({ contractingRole: 'contracting-manager' }).where(eq(user.id, 'pieter'));
  // Nobody has picked this one up.
  await breakdown('2026-10-02T08:00:00+02:00', null);
  return { db };
});

test('one row per Mechanic and an Unassigned row, Solved over the window and Not solved as it stands', async ({
  context: { db },
}) => {
  const report = await getMechanicPerformance({ db, input: june, today });
  expect(report.window).toMatchObject({ start: '2026-06-01', end: '2026-06-30' });
  expect(report.rows).toEqual([
    { mechanicUserId: 'anele', name: 'Anele', solvedCount: 1, averageReportToSolvedDays: 0.8, notSolvedCount: 1 },
    { mechanicUserId: 'pieter', name: 'Pieter', solvedCount: 1, averageReportToSolvedDays: 2, notSolvedCount: 0 },
    { mechanicUserId: 'bongani', name: 'Bongani', solvedCount: 0, averageReportToSolvedDays: null, notSolvedCount: 0 },
    { mechanicUserId: 'connor', name: 'Connor', solvedCount: 0, averageReportToSolvedDays: null, notSolvedCount: 0 },
    { mechanicUserId: null, name: 'Unassigned', solvedCount: 0, averageReportToSolvedDays: null, notSolvedCount: 1 },
  ]);

  // The earlier month moves Solved and its average; Not solved does not follow the window.
  const mayRows = (await getMechanicPerformance({ db, input: may, today })).rows;
  expect(mayRows.find((row) => row.mechanicUserId === 'anele')).toMatchObject({
    solvedCount: 1,
    averageReportToSolvedDays: 5,
    notSolvedCount: 1,
  });
  expect(mayRows.find((row) => row.mechanicUserId === 'pieter')).toMatchObject({ solvedCount: 0 });
});
