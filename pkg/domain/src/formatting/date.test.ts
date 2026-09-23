import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatDate,
  formatRelativeTime,
  getPlantDateNow,
  parseCommonDateInput,
  parseDate,
  toFileDateStamp,
  toPlantDateOnly,
  zonedDateStartToUtcInstant,
} from './date.js';

describe('parseDate', () => {
  it('returns Date values unchanged', () => {
    const date = new Date('2026-06-03T10:20:30.000Z');

    expect(parseDate(date)).toBe(date);
  });

  it('parses unix timestamp strings and numbers as seconds', () => {
    expect(parseDate('1')?.toISOString()).toBe('1970-01-01T00:00:01.000Z');
    expect(parseDate(1)?.toISOString()).toBe('1970-01-01T00:00:01.000Z');
  });

  it('parses ISO date strings', () => {
    expect(parseDate('2026-06-03T10:20:30.000Z')?.toISOString()).toBe('2026-06-03T10:20:30.000Z');
  });

  it('returns null for absent values', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

const stamp = (date: Date | null) => (date ? toFileDateStamp(date) : null);

describe('parseCommonDateInput', () => {
  it('parses common month-name date entry', () => {
    expect(stamp(parseCommonDateInput('May 22, 2026'))).toBe('2026-05-22');
    expect(stamp(parseCommonDateInput('May 22 2026'))).toBe('2026-05-22');
    expect(stamp(parseCommonDateInput('22 May 2026'))).toBe('2026-05-22');
    expect(stamp(parseCommonDateInput('Jun 18, 2026'))).toBe('2026-06-18');
  });

  it('parses common numeric date entry', () => {
    expect(stamp(parseCommonDateInput('2026-06-18'))).toBe('2026-06-18');
    expect(stamp(parseCommonDateInput('6/18/2026'))).toBe('2026-06-18');
    expect(stamp(parseCommonDateInput('6/18/26'))).toBe('2026-06-18');
    expect(stamp(parseCommonDateInput('18/06/2026'))).toBe('2026-06-18');
    expect(stamp(parseCommonDateInput('18-06-26'))).toBe('2026-06-18');
    expect(stamp(parseCommonDateInput('06.18.2026'))).toBe('2026-06-18');
  });

  it('rejects invalid date entry', () => {
    expect(parseCommonDateInput('May 35, 2026')).toBeNull();
    expect(parseCommonDateInput('Jun 12, 20')).toBeNull();
    expect(parseCommonDateInput('18-06-202')).toBeNull();
    expect(parseCommonDateInput('')).toBeNull();
  });
});

describe('formatDate', () => {
  const instant = new Date(2026, 5, 3, 14, 5, 9);

  it('formats absent values with an empty fallback', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(null, 'short', '-')).toBe('-');
    expect(formatDate('not a date', 'medium', '-')).toBe('-');
  });

  it('renders every named format in South African order', () => {
    expect(formatDate(instant)).toBe('3 Jun 2026');
    expect(formatDate(instant, 'short')).toBe('3 Jun 2026');
    expect(formatDate(instant, 'medium')).toBe('3 Jun 2026, 14:05');
    expect(formatDate(instant, 'long')).toBe('Wednesday, 3 June 2026');
    expect(formatDate(instant, 'day')).toBe('3 Jun');
    expect(formatDate(instant, 'time')).toBe('14:05');
    expect(formatDate(instant, 'month')).toBe('June 2026');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date(2026, 5, 3, 12, 0, 0);
  const secondsFromNow = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  it('reads under a minute either side of now as just now', () => {
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(secondsFromNow(-59), now)).toBe('just now');
    expect(formatRelativeTime(secondsFromNow(59), now)).toBe('just now');
  });

  it('names the largest whole unit in the past', () => {
    expect(formatRelativeTime(secondsFromNow(-60), now)).toBe('1 minute ago');
    expect(formatRelativeTime(secondsFromNow(-3_599), now)).toBe('59 minutes ago');
    expect(formatRelativeTime(secondsFromNow(-3 * 3_600 - 1_800), now)).toBe('3 hours ago');
    expect(formatRelativeTime(secondsFromNow(-86_400), now)).toBe('1 day ago');
    expect(formatRelativeTime(secondsFromNow(-5 * 86_400), now)).toBe('5 days ago');
    expect(formatRelativeTime(secondsFromNow(-29 * 86_400), now)).toBe('29 days ago');
    expect(formatRelativeTime(secondsFromNow(-30 * 86_400), now)).toBe('1 month ago');
    expect(formatRelativeTime(secondsFromNow(-400 * 86_400), now)).toBe('1 year ago');
  });

  it('names the largest whole unit in the future', () => {
    expect(formatRelativeTime(secondsFromNow(90), now)).toBe('in 1 minute');
    expect(formatRelativeTime(secondsFromNow(2 * 86_400), now)).toBe('in 2 days');
  });
});

describe('plant date helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives the current plant date from the system clock', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-18T22:00:00.000Z'));

    expect(getPlantDateNow()).toBe('2026-06-19');
  });

  it('converts instants to their Johannesburg plant business date', () => {
    expect(toPlantDateOnly(new Date('2026-06-18T21:59:59.000Z'))).toBe('2026-06-18');
    expect(toPlantDateOnly(new Date('2026-06-18T22:00:00.000Z'))).toBe('2026-06-19');
  });

  it('uses IANA timezone offsets when converting local day starts', () => {
    expect(zonedDateStartToUtcInstant('2026-01-15', 'America/New_York')).toEqual(new Date('2026-01-15T05:00:00.000Z'));
    expect(zonedDateStartToUtcInstant('2026-07-15', 'America/New_York')).toEqual(new Date('2026-07-15T04:00:00.000Z'));
  });
});
