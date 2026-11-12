import { type DateOnlyIso, INVOICED_MONTHS_SHOWN } from '@pkg/schema';

import { JOHANNESBURG_TIME_ZONE, zonedDateStartToUtcInstant } from '../formatting/date.js';
import { addDateOnlyMonths, startOfDateOnlyMonth } from '../formatting/date-only.js';

/** Invoiced by month's plant-time months, this one first, and the instant the oldest of them starts. */
export function invoicedMonthsWindow(today: DateOnlyIso): { months: DateOnlyIso[]; from: Date } {
  const thisMonth = startOfDateOnlyMonth(today);
  return {
    months: Array.from({ length: INVOICED_MONTHS_SHOWN }, (_, back) => addDateOnlyMonths(thisMonth, -back)),
    from: zonedDateStartToUtcInstant(addDateOnlyMonths(thisMonth, 1 - INVOICED_MONTHS_SHOWN), JOHANNESBURG_TIME_ZONE),
  };
}
