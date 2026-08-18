import type { DateIso, DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getFabricationTimingPresentation, timingWorkingDays } from './job-department-timing.js';

const day = (value: string) => value as DateOnlyIso;
const instant = (value: string) => value as DateIso;

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

describe('getFabricationTimingPresentation', () => {
  const today = day('2026-08-18');

  it('presents an observation started today as in progress', () => {
    expect(
      getFabricationTimingPresentation({
        timing: { completedAt: null, startedAt: instant('2026-08-18T08:00:00.000+02:00') },
        today,
        workingCalendar: {},
      }),
    ).toEqual({ durationDays: null, headline: 'Fabrication started today', state: 'in-progress' });
  });

  it('presents a completed observation with its inclusive working duration', () => {
    expect(
      getFabricationTimingPresentation({
        timing: {
          completedAt: instant('2026-08-18T15:00:00.000+02:00'),
          startedAt: instant('2026-08-18T08:00:00.000+02:00'),
        },
        today,
        workingCalendar: {},
      }),
    ).toEqual({ durationDays: 1, headline: 'Fabrication took 1 day', state: 'complete' });
  });

  it('presents an unstamped observation explicitly', () => {
    expect(
      getFabricationTimingPresentation({
        timing: { completedAt: null, startedAt: null },
        today,
        workingCalendar: {},
      }),
    ).toEqual({ durationDays: null, headline: 'Fabrication has not started', state: 'not-started' });
  });
});
