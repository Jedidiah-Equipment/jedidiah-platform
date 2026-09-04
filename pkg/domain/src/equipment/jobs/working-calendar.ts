import type { DateOnlyIso } from '@pkg/schema';
import type { BayCalendarExceptionDirection } from '@pkg/schema/equipment';

import { addDateOnlyDays } from '../../formatting/date-only.js';

export type WorkingCalendar = {
  bayExceptions?: ReadonlyMap<string, BayCalendarExceptionDirection>;
  orgOffDays?: ReadonlySet<string>;
};

export function countWorkingDaysBetween(
  startDate: DateOnlyIso,
  endDate: DateOnlyIso,
  workingCalendar: WorkingCalendar = {},
): number {
  let cursor = firstWorkingDayOnOrAfter(startDate, workingCalendar);
  let count = 0;

  while (cursor < endDate) {
    if (isWorkingDay(cursor, workingCalendar)) {
      count += 1;
    }

    cursor = addDateOnlyDays(cursor, 1);
  }

  return count;
}

export function firstWorkingDayOnOrAfter(date: DateOnlyIso, workingCalendar: WorkingCalendar = {}): DateOnlyIso {
  let cursor = date;

  while (!isWorkingDay(cursor, workingCalendar)) {
    cursor = addDateOnlyDays(cursor, 1);
  }

  return cursor;
}

/** Walks forward over the calendar's working days; a zero count lands on the given date itself. */
export function addWorkingDays(
  date: DateOnlyIso,
  workingDays: number,
  workingCalendar: WorkingCalendar = {},
): DateOnlyIso {
  let cursor = date;
  let remaining = workingDays;

  while (remaining > 0) {
    cursor = addDateOnlyDays(cursor, 1);
    if (isWorkingDay(cursor, workingCalendar)) remaining -= 1;
  }

  return cursor;
}

export function lastWorkingDayOnOrBefore(date: DateOnlyIso, workingCalendar: WorkingCalendar = {}): DateOnlyIso {
  let cursor = date;

  while (!isWorkingDay(cursor, workingCalendar)) {
    cursor = addDateOnlyDays(cursor, -1);
  }

  return cursor;
}

export function isWorkingDay(date: DateOnlyIso, workingCalendar: WorkingCalendar = {}): boolean {
  const bayException = workingCalendar.bayExceptions?.get(date);

  if (bayException) {
    return bayException === 'work';
  }

  return !workingCalendar.orgOffDays?.has(date);
}
