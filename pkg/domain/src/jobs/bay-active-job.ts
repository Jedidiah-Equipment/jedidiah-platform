import type { DateOnlyIso, ProjectedWorkJobSlot } from '@pkg/schema';

import { addDateOnlyDays } from '../formatting/date-only.js';
import { countWorkingDaysBetween, type WorkingCalendar } from './working-calendar.js';

/**
 * Progress of the Work Slot a Bay is running today, derived for the Bay Operator
 * screens (the Bay List card and the #519 ACTIVE NOW hero share these numbers).
 *
 * Slot spans are half-open `[startDate, endDate)`, so the last booked day is the
 * working day before `endDate` and "days left" counts today through that day.
 */
export type ActiveJobProgress = {
  /** Working days the Slot consumes in total. */
  totalWorkDays: number;
  /** Working days from today (inclusive) to the Slot end — the days-left countdown. */
  remainingWorkDays: number;
  /** Working days already worked before today. */
  elapsedWorkDays: number;
  /** Elapsed share of the Slot, 0–100, rounded. */
  progressPercent: number;
  /** The last booked working day (the day before the half-open `endDate`). */
  lastWorkDay: DateOnlyIso;
};

export function deriveActiveJobProgress({
  slot,
  today,
  workingCalendar = {},
}: {
  slot: Pick<ProjectedWorkJobSlot, 'startDate' | 'endDate'>;
  today: DateOnlyIso;
  workingCalendar?: WorkingCalendar;
}): ActiveJobProgress {
  const totalWorkDays = countWorkingDaysBetween(slot.startDate, slot.endDate, workingCalendar);
  // Clamp to the Slot so a stale `today` past the end never reports negative work left.
  const remainingWorkDays = Math.min(totalWorkDays, countWorkingDaysBetween(today, slot.endDate, workingCalendar));
  const elapsedWorkDays = totalWorkDays - remainingWorkDays;

  return {
    totalWorkDays,
    remainingWorkDays,
    elapsedWorkDays,
    progressPercent: totalWorkDays === 0 ? 0 : Math.round((elapsedWorkDays / totalWorkDays) * 100),
    lastWorkDay: addDateOnlyDays(slot.endDate, -1),
  };
}
