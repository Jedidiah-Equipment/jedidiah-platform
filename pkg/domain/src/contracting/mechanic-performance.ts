import type { MechanicPerformanceRow } from '@pkg/schema/contracting';
import { round1 } from './hours.js';

export const UNASSIGNED_MECHANIC_LABEL = 'Unassigned';

const MILLISECONDS_PER_DAY = 86_400_000;

/** Solved descending, name ascending, Unassigned last. */
export function orderMechanicPerformance(rows: readonly MechanicPerformanceRow[]): MechanicPerformanceRow[] {
  return [...rows].sort(
    (left, right) =>
      Number(left.mechanicUserId === null) - Number(right.mechanicUserId === null) ||
      right.solvedCount - left.solvedCount ||
      left.name.localeCompare(right.name),
  );
}

/** Mean of (solvedAt − reportedAt) in days to one decimal; null for an empty list. */
export function averageReportToSolvedDays(pairs: readonly { reportedAt: string; solvedAt: string }[]): number | null {
  if (pairs.length === 0) return null;
  const total = pairs.reduce((sum, pair) => sum + (Date.parse(pair.solvedAt) - Date.parse(pair.reportedAt)), 0);
  return round1(total / pairs.length / MILLISECONDS_PER_DAY);
}
