import type { DateOnlyIso } from '@pkg/schema';

import { diffDateOnlyDays } from '../formatting/date-only.js';

/**
 * How long a completed Job may sit uncleared before its commitment reads as stale (spec §3). The
 * age column on the close-out queue is the stale-commitment report; there is no second surface.
 */
export const STALE_CLOSE_OUT_DAYS = 30;

export type CloseOutAge = {
  ageDays: number;
  isStale: boolean;
};

/** Days a Job has waited for close-out since its Job Completion, both plant business dates. */
export function deriveCloseOutAge({
  completedOn,
  today,
}: {
  completedOn: DateOnlyIso;
  today: DateOnlyIso;
}): CloseOutAge {
  // Completion is human-controllable and takes future dates on the Job sheet; a Job cannot have
  // been waiting for less than no time, so the queue reads a not-yet-reached date as fresh.
  const ageDays = Math.max(0, diffDateOnlyDays(today, completedOn));

  return { ageDays, isStale: ageDays >= STALE_CLOSE_OUT_DAYS };
}
