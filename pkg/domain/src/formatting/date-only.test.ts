import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { addDateOnlyDays, maxDateOnly } from './date-only.js';

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
