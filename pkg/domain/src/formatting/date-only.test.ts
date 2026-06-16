import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  addDateOnlyDays,
  dateOnlyWeekday,
  diffDateOnlyDays,
  endOfDateOnlyWeek,
  maxDateOnly,
  startOfDateOnlyWeek,
} from './date-only.js';

const day = (value: string) => DateOnlyIso.parse(value);

describe('addDateOnlyDays', () => {
  it('adds days within a month', () => {
    expect(addDateOnlyDays(day('2026-06-05'), 4)).toBe('2026-06-09');
    expect(addDateOnlyDays(day('2026-06-05'), 0)).toBe('2026-06-05');
  });

  it('crosses month and year boundaries', () => {
    expect(addDateOnlyDays(day('2026-06-30'), 1)).toBe('2026-07-01');
    expect(addDateOnlyDays(day('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDateOnlyDays(day('2026-01-01'), -1)).toBe('2025-12-31');
  });

  it('handles leap days', () => {
    expect(addDateOnlyDays(day('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDateOnlyDays(day('2027-02-28'), 1)).toBe('2027-03-01');
  });
});

describe('maxDateOnly', () => {
  it('returns the later of two dates', () => {
    expect(maxDateOnly(day('2026-06-05'), day('2026-06-09'))).toBe('2026-06-09');
    expect(maxDateOnly(day('2026-12-01'), day('2026-06-09'))).toBe('2026-12-01');
    expect(maxDateOnly(day('2026-06-05'), day('2026-06-05'))).toBe('2026-06-05');
  });
});

describe('diffDateOnlyDays', () => {
  it('counts whole days between dates', () => {
    expect(diffDateOnlyDays(day('2026-06-09'), day('2026-06-05'))).toBe(4);
    expect(diffDateOnlyDays(day('2026-06-05'), day('2026-06-05'))).toBe(0);
  });

  it('is negative when later precedes earlier and crosses boundaries', () => {
    expect(diffDateOnlyDays(day('2026-06-05'), day('2026-06-09'))).toBe(-4);
    expect(diffDateOnlyDays(day('2027-01-01'), day('2026-12-31'))).toBe(1);
  });
});

describe('dateOnlyWeekday', () => {
  it('returns 0 for Sunday through 6 for Saturday', () => {
    // 2026-06-14 is a Sunday.
    expect(dateOnlyWeekday(day('2026-06-14'))).toBe(0);
    expect(dateOnlyWeekday(day('2026-06-15'))).toBe(1);
    expect(dateOnlyWeekday(day('2026-06-20'))).toBe(6);
  });
});

describe('startOfDateOnlyWeek', () => {
  it('returns the Monday of the containing week', () => {
    // 2026-06-15 is a Monday; the week runs Mon 15th through Sun 21st.
    expect(startOfDateOnlyWeek(day('2026-06-15'))).toBe('2026-06-15');
    expect(startOfDateOnlyWeek(day('2026-06-17'))).toBe('2026-06-15');
    expect(startOfDateOnlyWeek(day('2026-06-21'))).toBe('2026-06-15');
  });
});

describe('endOfDateOnlyWeek', () => {
  it('returns the Sunday ending the containing week', () => {
    expect(endOfDateOnlyWeek(day('2026-06-15'))).toBe('2026-06-21');
    expect(endOfDateOnlyWeek(day('2026-06-17'))).toBe('2026-06-21');
    expect(endOfDateOnlyWeek(day('2026-06-21'))).toBe('2026-06-21');
  });
});
