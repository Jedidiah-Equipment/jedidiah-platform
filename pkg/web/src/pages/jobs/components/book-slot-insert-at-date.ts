import {
  firstWorkingDayOnOrAfter,
  formatDate,
  formatJobSchedulingDateKey,
  type InsertAtDatePlacement,
  isWorkingDay,
  JOHANNESBURG_TIME_ZONE,
  johannesburgDayStart,
  resolveInsertAtDatePlacement,
  type WorkingCalendar,
  zonedDateStartToUtcInstant,
} from '@pkg/domain';
import type { ProjectedJobSlot } from '@pkg/schema';
import { addDays, format } from 'date-fns';

import { getSlotLabel } from './bay-schedule-summary.js';

export type BookSlotPlacement = InsertAtDatePlacement<ProjectedJobSlot>;

/**
 * Picker bounds for an Insert-at-Date booking: earliest tomorrow (the Slot
 * projected over today is never disturbed), latest the Bay's next available
 * working day (no machine-made idle from date picks). The max doubles as the
 * default value. Values are yyyy-MM-dd strings, matching DatePicker.
 */
export function getInsertAtDatePickerBounds(
  bay: { nextAvailableAt: string },
  workingCalendar: WorkingCalendar,
  currentDate: Date,
): { minValue: string; maxValue: string } {
  const tomorrow = addDays(johannesburgDayStart(currentDate), 1);
  const nextAvailableAt = johannesburgDayStart(new Date(bay.nextAvailableAt));
  const latest = firstWorkingDayOnOrAfter(nextAvailableAt < tomorrow ? tomorrow : nextAvailableAt, workingCalendar);

  return {
    minValue: formatJobSchedulingDateKey(tomorrow),
    maxValue: formatJobSchedulingDateKey(latest),
  };
}

/** Matches the Bay's non-working dates (org Off-Days minus Overtime, plus Closures) for the picker. */
export function createBayNonWorkingDateMatcher(workingCalendar: WorkingCalendar): (date: Date) => boolean {
  return (date) =>
    !isWorkingDay(zonedDateStartToUtcInstant(format(date, 'yyyy-MM-dd'), JOHANNESBURG_TIME_ZONE), workingCalendar);
}

export function resolveBookSlotPlacement({
  bay,
  currentDate,
  startDate,
  workingCalendar,
}: {
  bay: { scheduleOrigin: string; slots: readonly ProjectedJobSlot[] };
  currentDate: Date;
  startDate: string;
  workingCalendar: WorkingCalendar;
}): BookSlotPlacement {
  return resolveInsertAtDatePlacement({
    currentDate,
    pickedDate: zonedDateStartToUtcInstant(startDate, JOHANNESBURG_TIME_ZONE),
    scheduleOrigin: new Date(bay.scheduleOrigin),
    slots: bay.slots,
    workingCalendar,
  });
}

export function describeInsertAtDatePlacement(placement: BookSlotPlacement): {
  startText: string;
  splitWarning: string | null;
} {
  const startText = `Starts ${formatDate(placement.startAt, 'EEE, MMM d')}`;

  if (placement.type !== 'split') {
    return { startText, splitWarning: null };
  }

  const slotName = getSlotLabel(placement.targetSlot);

  return {
    startText,
    splitWarning: `Splits ${slotName}'s ${placement.targetSlot.durationDays}-day slot into ${placement.beforeDays} + ${placement.afterDays}.`,
  };
}
