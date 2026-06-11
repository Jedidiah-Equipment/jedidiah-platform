import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { fromJobCalendarDateKey, toJobCalendarDateKey } from './job-date-key.js';

describe('job calendar date keys', () => {
  it('formats local calendar column dates without timezone conversion', () => {
    expect(toJobCalendarDateKey(new Date(2026, 5, 19, 23, 59, 59))).toBe('2026-06-19');
  });

  it('parses date keys as local calendar column dates', () => {
    const date = fromJobCalendarDateKey(DateOnlyIso.parse('2026-06-19'));

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(19);
    expect(date.getHours()).toBe(0);
  });

  it('round-trips date keys through the local calendar basis', () => {
    expect(toJobCalendarDateKey(fromJobCalendarDateKey(DateOnlyIso.parse('2026-06-19')))).toBe('2026-06-19');
  });
});
