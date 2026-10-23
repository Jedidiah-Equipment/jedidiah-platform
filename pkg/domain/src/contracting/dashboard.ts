import type { BreakdownUrgency, NeedsALookLevel } from '@pkg/schema/contracting';
import { countedAssignmentAttentionLevel } from './assignment-attention.js';

const levelRank: Record<NeedsALookLevel, number> = { critical: 0, warning: 1 };

/** The Dashboard's Jobs needing a look: critical before warning, then by Job Number. */
export function orderJobsNeedingALook<
  T extends { jobNumber: string; assignmentAttention: Record<NeedsALookLevel, number> },
>(jobs: readonly T[]): T[] {
  const rank = (job: T) => {
    const level = countedAssignmentAttentionLevel(job.assignmentAttention);
    return level ? levelRank[level] : Number.POSITIVE_INFINITY;
  };
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
