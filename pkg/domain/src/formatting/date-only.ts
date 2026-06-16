import type { DateOnlyIso } from '@pkg/schema';

import { parseDateOnlyParts } from './date.js';

// Scheduling computes on whole `yyyy-MM-dd` plant business dates,
// branded as DateOnlyIso so unvalidated plain strings cannot sneak in. Date-only
// values carry no time or timezone and compare correctly with plain string
// comparison; these helpers are pure calendar arithmetic.

export function addDateOnlyDays(date: DateOnlyIso, days: number): DateOnlyIso {
  const { day, month, year } = parseDateOnlyParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return toDateOnlyParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function maxDateOnly(a: DateOnlyIso, b: DateOnlyIso): DateOnlyIso {
  return a >= b ? a : b;
}

/** Whole-day difference `later - earlier`; negative when `later` precedes `earlier`. */
export function diffDateOnlyDays(later: DateOnlyIso, earlier: DateOnlyIso): number {
  const a = parseDateOnlyParts(later);
  const b = parseDateOnlyParts(earlier);

  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000);
}

/** Day of week as 0 (Sunday) through 6 (Saturday). */
export function dateOnlyWeekday(date: DateOnlyIso): number {
  const { day, month, year } = parseDateOnlyParts(date);

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Monday starting the Monday-based week containing the given date. */
export function startOfDateOnlyWeek(date: DateOnlyIso): DateOnlyIso {
  return addDateOnlyDays(date, -((dateOnlyWeekday(date) + 6) % 7));
}

/** Sunday ending the Monday-based week containing the given date. */
export function endOfDateOnlyWeek(date: DateOnlyIso): DateOnlyIso {
  return addDateOnlyDays(startOfDateOnlyWeek(date), 6);
}

function toDateOnlyParts(year: number, month: number, day: number): DateOnlyIso {
  // Correct by construction — the brand cast for computed dates.
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateOnlyIso;
}
