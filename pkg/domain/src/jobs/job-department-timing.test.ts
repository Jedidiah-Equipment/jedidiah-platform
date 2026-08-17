import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { timingWorkingDays } from './job-department-timing.js';

const day = (value: string) => value as DateOnlyIso;

// 2026-06-01 is a Monday.
describe('timingWorkingDays', () => {
  it('counts a same-day stamp as one working day', () => {
    expect(timingWorkingDays(day('2026-06-01'), day('2026-06-01'), {})).toBe(1);
  });

  it('counts both stamp days inclusively', () => {
    expect(timingWorkingDays(day('2026-06-01'), day('2026-06-03'), {})).toBe(3);
  });

  it('skips org off-days between the stamps', () => {
    const workingCalendar = { orgOffDays: new Set(['2026-06-02']) };

    expect(timingWorkingDays(day('2026-06-01'), day('2026-06-03'), workingCalendar)).toBe(2);
  });

  it('floors at one when both stamp days are off-days', () => {
    const workingCalendar = { orgOffDays: new Set(['2026-06-06', '2026-06-07']) };

    expect(timingWorkingDays(day('2026-06-06'), day('2026-06-07'), workingCalendar)).toBe(1);
  });
});
