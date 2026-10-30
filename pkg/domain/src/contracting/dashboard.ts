import type { BreakdownUrgency } from '@pkg/schema/contracting';

/** The Dashboard's Jobs needing a look: those that do first, then by Job Number. */
export function orderJobsNeedingALook<T extends { jobNumber: string; assignmentAttention: number }>(
  jobs: readonly T[],
): T[] {
  const rank = (job: T) => (job.assignmentAttention > 0 ? 0 : 1);
  return [...jobs].sort((a, b) => rank(a) - rank(b) || a.jobNumber.localeCompare(b.jobNumber));
}

const urgencyRank: Record<BreakdownUrgency, number> = { 'code-red': 0, 'code-green': 1 };

/** The Dashboard's unsolved Breakdowns: Code Red first, then the one waiting longest. */
export function orderUnsolvedBreakdowns<T extends { urgency: BreakdownUrgency; reportedAt: string }>(
  breakdowns: readonly T[],
): T[] {
  return [...breakdowns].sort(
    (a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || Date.parse(a.reportedAt) - Date.parse(b.reportedAt),
  );
}
