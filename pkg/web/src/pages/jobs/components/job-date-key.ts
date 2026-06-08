import {
  JOHANNESBURG_TIME_ZONE,
  parseDateOnlyParts,
  toJohannesburgDateKey,
  zonedDateStartToUtcInstant,
} from '@pkg/domain';

// Job scheduling data is stored as Johannesburg business dates, while Kibo renders
// calendar/Gantt columns as browser-local dates. Keep both conversions explicit.
export function toJobDateKey(date: Date): string {
  return toJohannesburgDateKey(date);
}

export function fromJobDateKey(value: string): Date {
  return zonedDateStartToUtcInstant(value, JOHANNESBURG_TIME_ZONE);
}

export function toJobCalendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function fromJobCalendarDateKey(value: string): Date {
  const { day, month, year } = parseDateOnlyParts(value);

  // Use browser-local midnight so bands line up with Kibo's local daily columns.
  return new Date(year, month - 1, day);
}

export function toJobCalendarDate(date: Date): Date {
  return fromJobCalendarDateKey(toJobDateKey(date));
}
