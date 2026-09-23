import type { DateOnlyIso } from '@pkg/schema';
import {
  differenceInSeconds,
  formatDate as formatDateDfns,
  fromUnixTime,
  isSameDay,
  isSameYear,
  isValid,
  parse,
  parseISO,
  subDays,
} from 'date-fns';

/**
 * Every date a person reads renders in one of these shapes, in South African order. A surface that
 * needs a new shape adds it here as a named format rather than passing a pattern at the call site.
 */
export type DateFormat = 'short' | 'medium' | 'long' | 'duration' | 'day' | 'time' | 'month';

const DATE_FORMAT_PATTERNS = {
  day: 'd MMM',
  long: 'EEEE, d MMMM yyyy',
  medium: 'd MMM yyyy, HH:mm',
  month: 'MMMM yyyy',
  short: 'd MMM yyyy',
  time: 'HH:mm',
} as const satisfies Record<Exclude<DateFormat, 'duration'>, string>;

export const JOHANNESBURG_TIME_ZONE = 'Africa/Johannesburg';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const commonDateInputFormats = [
  // Internal parse-only formats for typed form input; display formatting still uses formatDate.
  'yyyy-MM-dd',
  'PP',
  'PPP',
  'MMMM d, yyyy',
  'MMM d, yyyy',
  'MMMM d yyyy',
  'MMM d yyyy',
  'd MMMM yyyy',
  'd MMM yyyy',
  'M/d/yy',
  'MM/dd/yy',
  'M/d/yyyy',
  'MM/dd/yyyy',
  'yyyy/M/d',
  'yyyy/MM/dd',
  'M-d-yy',
  'MM-dd-yy',
  'M-d-yyyy',
  'MM-dd-yyyy',
  'yyyy-M-d',
  'M.d.yy',
  'MM.dd.yy',
  'M.d.yyyy',
  'MM.dd.yyyy',
  'yyyy.M.d',
  'yyyy.MM.dd',
  'd/M/yy',
  'dd/MM/yy',
  'd/M/yyyy',
  'dd/MM/yyyy',
  'd-M-yy',
  'dd-MM-yy',
  'd-M-yyyy',
  'dd-MM-yyyy',
];

export const parseDate = (date?: Date | string | number | null): Date | null => {
  if (date instanceof Date) {
    return date;
  }

  if (typeof date === 'string') {
    if (isIntegerString(date)) {
      return fromUnixTime(Number.parseInt(date, 10));
    }

    return parseISO(date);
  }

  if (typeof date === 'number') {
    return fromUnixTime(date);
  }

  return null;
};

export const parseCommonDateInput = (value: string): Date | null => {
  const trimmedValue = value.trim();
  if (trimmedValue === '') return null;

  return (
    commonDateInputFormats
      .filter((dateFormat) => canParseDateInputFormat(dateFormat, trimmedValue))
      .map((dateFormat) => parse(trimmedValue, dateFormat, new Date()))
      .find((parsedDate) => isValid(parsedDate) && hasFourDigitYear(parsedDate)) ?? null
  );
};

export const formatDate = (date?: Date | string | number | null, format: DateFormat = 'short', emptyValue?: string) => {
  const parsedDate = parseDate(date);

  if (!parsedDate || !isValid(parsedDate)) {
    return emptyValue ?? '';
  }

  if (format === 'duration') {
    return formatRelativeTime(parsedDate);
  }

  return formatDateDfns(parsedDate, DATE_FORMAT_PATTERNS[format]);
};

const RELATIVE_TIME_UNITS = [
  { name: 'year', seconds: 365 * 24 * 60 * 60 },
  { name: 'month', seconds: 30 * 24 * 60 * 60 },
  { name: 'day', seconds: 24 * 60 * 60 },
  { name: 'hour', seconds: 60 * 60 },
  { name: 'minute', seconds: 60 },
] as const;

/** The largest whole unit between `date` and `now`: `5 days ago`, `in 2 days`, `just now` under a minute. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const secondsAgo = differenceInSeconds(now, date, { roundingMethod: 'trunc' });
  const magnitude = Math.abs(secondsAgo);
  const unit = RELATIVE_TIME_UNITS.find((candidate) => magnitude >= candidate.seconds);

  if (!unit) {
    return 'just now';
  }

  const count = Math.floor(magnitude / unit.seconds);
  const amount = `${count} ${unit.name}${count === 1 ? '' : 's'}`;

  return secondsAgo > 0 ? `${amount} ago` : `in ${amount}`;
}

/**
 * The heading over a day's entries in an activity feed. Today and Yesterday are named as well as
 * dated, and the year only appears once it is no longer the obvious one.
 */
export function formatDayHeading(date: Date, now: Date): string {
  const dayLabel = formatDateDfns(date, isSameYear(date, now) ? 'EEE d MMM' : 'EEE d MMM yyyy');

  if (isSameDay(date, now)) {
    return `Today · ${dayLabel}`;
  }

  if (isSameDay(date, subDays(now, 1))) {
    return `Yesterday · ${dayLabel}`;
  }

  return dayLabel;
}

/** A machine-readable calendar date for file names, never for display. */
export function toFileDateStamp(date: Date): string {
  return formatDateDfns(date, 'yyyy-MM-dd');
}

export function getZonedDateParts(
  date: Date,
  timeZone: string,
): {
  day: number;
  month: number;
  weekday: number;
  year: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hourCycle: 'h23',
    month: '2-digit',
    timeZone,
    weekday: 'short',
    year: 'numeric',
  }).formatToParts(date);

  return {
    day: Number(getDateTimePart(parts, 'day')),
    month: Number(getDateTimePart(parts, 'month')),
    weekday: parseWeekday(getDateTimePart(parts, 'weekday')),
    year: Number(getDateTimePart(parts, 'year')),
  };
}

export function zonedDateStartToUtcInstant(dateOnly: string, timeZone: string): Date {
  const { day, month, year } = parseDateOnlyParts(dateOnly);
  const localMidnightAsUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offset = getTimeZoneOffsetMilliseconds(localMidnightAsUtc, timeZone);
  const candidate = new Date(localMidnightAsUtc.getTime() - offset);

  return new Date(localMidnightAsUtc.getTime() - getTimeZoneOffsetMilliseconds(candidate, timeZone));
}

export function parseDateOnlyParts(dateOnly: string): { day: number; month: number; year: number } {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(dateOnly);

  if (!match?.groups) {
    throw new Error(`Invalid date-only value ${dateOnly}`);
  }

  return {
    day: Number(match.groups.day),
    month: Number(match.groups.month),
    year: Number(match.groups.year),
  };
}

export function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const zonedTimestamp = Date.UTC(
    Number(getDateTimePart(parts, 'year')),
    Number(getDateTimePart(parts, 'month')) - 1,
    Number(getDateTimePart(parts, 'day')),
    Number(getDateTimePart(parts, 'hour')),
    Number(getDateTimePart(parts, 'minute')),
    Number(getDateTimePart(parts, 'second')),
  );

  return zonedTimestamp - date.getTime();
}

export function toDateOnlyIso(epochDay: number): string {
  return new Date(epochDay * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

export function toPlantDateOnly(date: Date): DateOnlyIso {
  const { day, month, year } = getZonedDateParts(date, JOHANNESBURG_TIME_ZONE);

  // Correct by construction — mints the brand where an instant becomes a plant business date.
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateOnlyIso;
}

export function getPlantDateNow(): DateOnlyIso {
  return toPlantDateOnly(new Date());
}

function isIntegerString(value: string): boolean {
  return /^-?\d+$/.test(value.trim());
}

function canParseDateInputFormat(dateFormat: string, value: string): boolean {
  if (!dateFormat.includes('yyyy')) return true;

  return /\d{4}/.test(value);
}

function hasFourDigitYear(date: Date): boolean {
  const year = date.getFullYear();

  return year >= 1000 && year <= 9999;
}

function getDateTimePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new Error(`Missing ${type} part in formatted date`);
  }

  return value;
}

function parseWeekday(weekday: string): number {
  const weekdays = {
    Fri: 5,
    Mon: 1,
    Sat: 6,
    Sun: 0,
    Thu: 4,
    Tue: 2,
    Wed: 3,
  } as const satisfies Record<string, number>;
  const parsed = weekdays[weekday as keyof typeof weekdays];

  if (parsed === undefined) {
    throw new Error(`Unsupported weekday ${weekday}`);
  }

  return parsed;
}
