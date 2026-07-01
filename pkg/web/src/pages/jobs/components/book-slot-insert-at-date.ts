import {
  addDateOnlyDays,
  firstWorkingDayOnOrAfter,
  formatDate,
  isWorkingDay,
  maxDateOnly,
  type WorkingCalendar,
} from '@pkg/domain';
import type { DateOnlyIso, JobSchedulePreviewPlacement } from '@pkg/schema';

import { getSlotLabel } from './bay-schedule-summary.js';
import { toJobCalendarDateKey } from './job-date-key.js';

export type BookSlotPlacement = JobSchedulePreviewPlacement;

/**
 * Picker bounds for an Insert-at-Date booking: earliest tomorrow (the Slot
 * projected over today is never disturbed), latest the Bay's next available
 * working day (no machine-made idle from date picks). The max doubles as the
 * default value. Values are yyyy-MM-dd strings, matching DatePicker; `today`
 * is the plant business date shipped by the schedule read, never the client clock.
 */
export function getInsertAtDatePickerBounds(
  bay: { nextAvailableDate: DateOnlyIso },
  workingCalendar: WorkingCalendar,
  today: DateOnlyIso,
): { minValue: string; maxValue: string } {
  const tomorrow = addDateOnlyDays(today, 1);
  const latest = firstWorkingDayOnOrAfter(maxDateOnly(bay.nextAvailableDate, tomorrow), workingCalendar);

  return {
    minValue: tomorrow,
    maxValue: latest,
  };
}

/** Matches the Bay's non-working dates (org Off-Days minus Overtime, plus Closures) for the picker. */
export function createBayNonWorkingDateMatcher(workingCalendar: WorkingCalendar): (date: Date) => boolean {
  return (date) => !isWorkingDay(toJobCalendarDateKey(date), workingCalendar);
}

export function describeInsertAtDatePlacement(placement: BookSlotPlacement): {
  startText: string;
  splitWarning: string | null;
} {
  const startText = `Starts ${formatDate(placement.startDate, 'EEE, MMM d')}`;

  if (placement.type !== 'split' || !('targetSlot' in placement)) {
    return { startText, splitWarning: null };
  }

  const slotName = getSlotLabel(placement.targetSlot);

  return {
    startText,
    splitWarning: `Splits ${slotName}'s ${placement.targetSlot.durationDays}-day slot into ${placement.beforeDays} + ${placement.afterDays}.`,
  };
}
