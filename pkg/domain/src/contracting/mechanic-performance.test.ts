import type { MechanicPerformanceRow } from '@pkg/schema/contracting';
import { expect, test } from 'vitest';
import { averageReportToSolvedDays, orderMechanicPerformance } from './mechanic-performance.js';

const row = (mechanicUserId: string | null, name: string, solvedCount: number): MechanicPerformanceRow => ({
  mechanicUserId: mechanicUserId as MechanicPerformanceRow['mechanicUserId'],
  name,
  solvedCount,
  averageReportToSolvedDays: null,
  notSolvedCount: 0,
});

test('orders Solved descending, then name, with Unassigned last whatever its counts', () => {
  const ordered = orderMechanicPerformance([
    row(null, 'Unassigned', 9),
    row('b', 'Bongani', 2),
    row('a', 'Anele', 2),
    row('c', 'Carel', 5),
  ]);
  expect(ordered.map((entry) => entry.name)).toEqual(['Carel', 'Anele', 'Bongani', 'Unassigned']);
});

test('averages report-to-solved in days to one decimal, and has no average without solved work', () => {
  expect(
    averageReportToSolvedDays([
      { reportedAt: '2026-06-01T08:00:00Z', solvedAt: '2026-06-01T20:00:00Z' },
      { reportedAt: '2026-06-02T08:00:00Z', solvedAt: '2026-06-03T08:00:00Z' },
    ]),
  ).toBe(0.8);
  expect(averageReportToSolvedDays([])).toBeNull();
});
