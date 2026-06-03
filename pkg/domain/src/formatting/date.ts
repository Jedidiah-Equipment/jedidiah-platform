import { differenceInSeconds, formatDate as formatDateDfns, fromUnixTime, isValid, parse, parseISO } from 'date-fns';

export type DateFormat = 'short' | 'medium' | 'long' | 'duration' | 'duration-short' | (string & NonNullable<unknown>);

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
