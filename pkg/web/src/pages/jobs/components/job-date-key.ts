import {
  JOHANNESBURG_TIME_ZONE,
  parseDateOnlyParts,
  toJohannesburgDateKey,
  zonedDateStartToUtcInstant,
} from '@pkg/domain';

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

  // Kibo calendar/Gantt columns are rendered as browser-local days.
  return new Date(year, month - 1, day);
}
