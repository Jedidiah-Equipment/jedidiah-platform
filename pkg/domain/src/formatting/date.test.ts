import { describe, expect, it } from 'vitest';

import { formatDate, parseDate, secondsToAgeString } from './date.js';

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
