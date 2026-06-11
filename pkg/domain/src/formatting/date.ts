import type { DateOnlyIso } from '@pkg/schema';
import { differenceInSeconds, formatDate as formatDateDfns, fromUnixTime, isValid, parse, parseISO } from 'date-fns';

export type DateFormat = 'short' | 'medium' | 'long' | 'duration' | 'duration-short' | (string & NonNullable<unknown>);

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

  if (!parsedDate) {
    return emptyValue ?? '';
  }

  if (format === 'short') {
    return formatDateDfns(parsedDate, 'PP');
  }

  if (format === 'medium') {
    if (new Date().getFullYear() === parsedDate.getFullYear()) {
      return formatDateDfns(parsedDate, 'LLL do, HH:mm:ss');
    }
    return formatDateDfns(parsedDate, 'LLL do, yyyy, HH:mm:ss');
  }

  if (format === 'long') {
    return formatDateDfns(parsedDate, 'PPpp');
  }

  if (format === 'duration' || format === 'duration-short') {
    return secondsToAgeString(
      Math.max(
        differenceInSeconds(new Date(), parsedDate, {
          roundingMethod: 'floor',
        }),
        1,
      ),
      format === 'duration-short',
    );
  }

  return formatDateDfns(parsedDate, format);
};

export const secondsToAgeString = (seconds: number, short = false) => {
  const years = Math.floor(seconds / 31_536_000);
  const max = 2;
  let current = 0;
  let str = '';

  let secs = seconds;

  if (years && current < max) {
    str += `${years}y `;
    if (short) {
      return str;
    }
    current++;
  }

  secs %= 31_536_000;
  const days = Math.floor(secs / 86_400);
  if (days && current < max) {
    str += `${days}d `;
    if (short) {
      return str;
    }
    current++;
    return str;
  }

  secs %= 86_400;
  const hours = Math.floor(secs / 3_600);
  if (hours && current < max) {
    str += `${hours}h `;
    if (short) {
      return str;
    }
    current++;
  }

  secs %= 3_600;
  const minutes = Math.floor(secs / 60);
  if (minutes && current < max) {
    str += `${minutes}m `;
    current++;
    return str;
  }

  const s = seconds % 60;
  if (s && current < max) {
    str += `${s}s `;
    current++;
  }

  return str || '1s';
};

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
