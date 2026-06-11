import type { DateOnlyIso } from '@pkg/schema';

import { parseDateOnlyParts } from './date.js';

// Scheduling computes on whole `yyyy-MM-dd` plant business dates (ADR-0043),
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

function toDateOnlyParts(year: number, month: number, day: number): DateOnlyIso {
  // Correct by construction — the brand cast for computed dates.
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateOnlyIso;
}
