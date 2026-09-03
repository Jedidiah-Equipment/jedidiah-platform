import { parseDateOnlyParts } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';

// Job scheduling data ships as yyyy-MM-dd plant business dates, while Kibo renders
// calendar/Gantt columns as browser-local dates. These are the only bridges between
// the two — pure local-calendar conversions, no timezone involved.
export function toJobCalendarDateKey(date: Date): DateOnlyIso {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Correct by construction — mints the brand where a local Date becomes a calendar date.
  return `${year}-${month}-${day}` as DateOnlyIso;
}

export function fromJobCalendarDateKey(value: DateOnlyIso): Date {
  const { day, month, year } = parseDateOnlyParts(value);

  // Use browser-local midnight so bands line up with Kibo's local daily columns.
  return new Date(year, month - 1, day);
}
