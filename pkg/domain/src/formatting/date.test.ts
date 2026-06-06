import { describe, expect, it } from 'vitest';

import {
  formatDate,
  johannesburgDayStart,
  parseCommonDateInput,
  parseDate,
  secondsToAgeString,
  toJohannesburgDateKey,
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

describe('parseCommonDateInput', () => {
  it('parses common month-name date entry', () => {
    expect(formatDate(parseCommonDateInput('May 22, 2026'), 'yyyy-MM-dd')).toBe('2026-05-22');
    expect(formatDate(parseCommonDateInput('May 22 2026'), 'yyyy-MM-dd')).toBe('2026-05-22');
    expect(formatDate(parseCommonDateInput('22 May 2026'), 'yyyy-MM-dd')).toBe('2026-05-22');
    expect(formatDate(parseCommonDateInput('Jun 18, 2026'), 'yyyy-MM-dd')).toBe('2026-06-18');
  });

  it('parses common numeric date entry', () => {
    expect(formatDate(parseCommonDateInput('2026-06-18'), 'yyyy-MM-dd')).toBe('2026-06-18');
    expect(formatDate(parseCommonDateInput('6/18/2026'), 'yyyy-MM-dd')).toBe('2026-06-18');
    expect(formatDate(parseCommonDateInput('6/18/26'), 'yyyy-MM-dd')).toBe('2026-06-18');
    expect(formatDate(parseCommonDateInput('18/06/2026'), 'yyyy-MM-dd')).toBe('2026-06-18');
    expect(formatDate(parseCommonDateInput('18-06-26'), 'yyyy-MM-dd')).toBe('2026-06-18');
    expect(formatDate(parseCommonDateInput('06.18.2026'), 'yyyy-MM-dd')).toBe('2026-06-18');
  });

  it('rejects invalid date entry', () => {
    expect(parseCommonDateInput('May 35, 2026')).toBeNull();
    expect(parseCommonDateInput('Jun 12, 20')).toBeNull();
    expect(parseCommonDateInput('18-06-202')).toBeNull();
    expect(parseCommonDateInput('')).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats absent values with an empty fallback', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(null, 'short', '-')).toBe('-');
  });

  it('formats short and long dates', () => {
    expect(formatDate('2026-06-03T10:20:30.000Z', 'short')).toBe('Jun 3, 2026');
    expect(formatDate('2026-06-03T10:20:30.000Z', 'dd/MM/yyyy')).toBe('03/06/2026');
  });
});

describe('secondsToAgeString', () => {
  it('formats ages with two largest units by default', () => {
    expect(secondsToAgeString(3_660)).toBe('1h 1m ');
    expect(secondsToAgeString(90_000)).toBe('1d ');
  });

  it('formats short ages with one unit', () => {
    expect(secondsToAgeString(3_660, true)).toBe('1h ');
  });
});

describe('Johannesburg date helpers', () => {
  it('formats instants as Johannesburg business date keys', () => {
    expect(toJohannesburgDateKey(new Date('2026-06-18T21:59:59.000Z'))).toBe('2026-06-18');
    expect(toJohannesburgDateKey(new Date('2026-06-18T22:00:00.000Z'))).toBe('2026-06-19');
  });

  it('returns the UTC instant for the start of a Johannesburg day', () => {
    expect(johannesburgDayStart(new Date('2026-06-18T22:30:00.000Z'))).toEqual(new Date('2026-06-18T22:00:00.000Z'));
  });

  it('uses IANA timezone offsets when converting local day starts', () => {
    expect(zonedDateStartToUtcInstant('2026-01-15', 'America/New_York')).toEqual(new Date('2026-01-15T05:00:00.000Z'));
    expect(zonedDateStartToUtcInstant('2026-07-15', 'America/New_York')).toEqual(new Date('2026-07-15T04:00:00.000Z'));
  });
});
