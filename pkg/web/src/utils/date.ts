import { differenceInSeconds, formatDate as formatDateDfns, fromUnixTime, parseISO } from 'date-fns';
import { z } from 'zod';

type Format = 'short' | 'medium' | 'long' | 'duration' | 'duration-short' | (string & NonNullable<unknown>);

export const formatDate = (date?: Date | string | number | null, format: Format = 'short', emptyValue?: string) => {
  let parsedDate: Date | null = null;

  if (date instanceof Date) parsedDate = date as Date;

  if (typeof date === 'string') {
    if (z.coerce.number().safeParse(date).success) parsedDate = fromUnixTime(Number.parseInt(date, 10));
    else parsedDate = parseISO(date);
  }

  if (typeof date === 'number') {
    parsedDate = fromUnixTime(date);
  }

  if (!parsedDate) return emptyValue ?? '';

  // can do this to show the date in the original timezone
  // parsedDate = addMinutes(parsedDate, parsedDate.getTimezoneOffset());

  if (format === 'short') return formatDateDfns(parsedDate, 'PP');

  if (format === 'medium') {
    // only show the year if its not the same year as now
    if (new Date().getFullYear() === parsedDate.getFullYear()) return formatDateDfns(parsedDate, 'LLL do, HH:mm:ss');
    return formatDateDfns(parsedDate, 'LLL do, yyyy, HH:mm:ss');
  }

  if (format === 'long') return formatDateDfns(parsedDate, 'PPpp');

  if (format === 'duration' || format === 'duration-short')
    return secondsToAgeString(
      Math.max(
        differenceInSeconds(new Date(), parsedDate, {
          roundingMethod: 'floor',
        }),
        1,
      ),
      format === 'duration-short',
    );

  return formatDateDfns(parsedDate, format);
};

export const secondsToAgeString = (seconds: number, short = false) => {
  const years = Math.floor(seconds / 31536000);
  const max = 2;
  let current = 0;
  let str = '';

  let secs = seconds;

  if (years && current < max) {
    str += `${years}y `;
    if (short) return str;
    current++;
  }

  secs %= 31536000;
  const days = Math.floor(secs / 86400);
  if (days && current < max) {
    str += `${days}d `;
    if (short) return str;
    current++;
    return str;
  }

  secs %= 86400;
  const hours = Math.floor(secs / 3600);
  if (hours && current < max) {
    str += `${hours}h `;
    if (short) return str;
    current++;
  }

  secs %= 3600;
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
