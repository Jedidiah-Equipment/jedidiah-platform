import { describe, expect, it } from 'vitest';

import {
  formatJobSchedulingDate,
  fromJobCalendarDateKey,
  fromJobDateKey,
  toJobCalendarDateKey,
  toJobDateKey,
} from './job-date-key.js';

describe('job date keys', () => {
  it('formats dates using the Johannesburg business day', () => {
    expect(toJobDateKey(new Date('2026-06-18T21:59:59.000Z'))).toBe('2026-06-18');
    expect(toJobDateKey(new Date('2026-06-18T22:00:00.000Z'))).toBe('2026-06-19');
  });

  it('parses date keys as Johannesburg day starts', () => {
    expect(fromJobDateKey('2026-06-19')).toEqual(new Date('2026-06-18T22:00:00.000Z'));
  });

  it('round-trips date keys through the shared Johannesburg basis', () => {
    expect(toJobDateKey(fromJobDateKey('2026-06-19'))).toBe('2026-06-19');
  });

  it('formats scheduling instants as their Johannesburg business day in any browser timezone', () => {
    expect(formatJobSchedulingDate(new Date('2026-06-08T22:00:00.000Z'), 'MMM d')).toBe('Jun 9');
    expect(formatJobSchedulingDate('2026-06-08T22:00:00.000Z', 'MMM d')).toBe('Jun 9');
    expect(formatJobSchedulingDate(new Date('2026-06-08T21:59:59.000Z'), 'MMM d')).toBe('Jun 8');
  });

  it('formats local calendar column dates without timezone conversion', () => {
    expect(toJobCalendarDateKey(new Date(2026, 5, 19, 23, 59, 59))).toBe('2026-06-19');
  });

  it('parses date keys as local calendar column dates', () => {
    const date = fromJobCalendarDateKey('2026-06-19');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(19);
    expect(date.getHours()).toBe(0);
  });
});
