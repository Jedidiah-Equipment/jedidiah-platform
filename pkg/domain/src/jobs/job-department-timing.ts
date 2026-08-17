import type { DateOnlyIso } from '@pkg/schema';

import { addDateOnlyDays } from '../formatting/date-only.js';
import { countWorkingDaysBetween, type WorkingCalendar } from './working-calendar.js';

/**
 * Inclusive elapsed working days between the two stamp days: started Monday, done Wednesday
 * reads 3, and a same-day span reads 1, matching how a 1-day Slot reads. Uses the org
 * working calendar only — bay exceptions belong to scheduling, and a stamp is not a Slot.
 */
export function timingWorkingDays(
  startedOn: DateOnlyIso,
  completedOn: DateOnlyIso,
  workingCalendar: WorkingCalendar,
): number {
  return Math.max(1, countWorkingDaysBetween(startedOn, addDateOnlyDays(completedOn, 1), workingCalendar));
}
