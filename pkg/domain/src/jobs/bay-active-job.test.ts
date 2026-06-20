import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { deriveActiveJobProgress } from './bay-active-job.js';

const day = (value: string) => DateOnlyIso.parse(value);

// A Work Slot ending Tue 7 Jul (half-open end Wed 8 Jul), with weekends as org
// off-days so the working-day arithmetic is exercised: 16 working days in total.
const weekendsOff = {
  orgOffDays: new Set(['2026-06-20', '2026-06-21', '2026-06-27', '2026-06-28', '2026-07-04', '2026-07-05']),
};
const slot = { startDate: day('2026-06-16'), endDate: day('2026-07-08') };

describe('deriveActiveJobProgress', () => {
  it('splits the Slot into elapsed and remaining work days', () => {
    // Today (Thu 2 Jul) leaves Thu/Fri + Mon/Tue — 4 working days, incl. today.
    const progress = deriveActiveJobProgress({ slot, today: day('2026-07-02'), workingCalendar: weekendsOff });

    expect(progress.totalWorkDays).toBe(16);
    expect(progress.remainingWorkDays).toBe(4);
    expect(progress.elapsedWorkDays).toBe(12);
    expect(progress.progressPercent).toBe(75);
  });

  it('reports the last booked working day before the half-open end', () => {
    const progress = deriveActiveJobProgress({ slot, today: day('2026-06-16'), workingCalendar: weekendsOff });

    expect(progress.lastWorkDay).toBe('2026-07-07');
  });

  it('is full and zero-remaining at or past the Slot end', () => {
    const progress = deriveActiveJobProgress({ slot, today: day('2026-07-20'), workingCalendar: weekendsOff });

    expect(progress.remainingWorkDays).toBe(0);
    expect(progress.elapsedWorkDays).toBe(16);
    expect(progress.progressPercent).toBe(100);
  });

  it('treats a zero-length Slot as no progress rather than dividing by zero', () => {
    const progress = deriveActiveJobProgress({
      slot: { startDate: day('2026-06-16'), endDate: day('2026-06-16') },
      today: day('2026-06-16'),
    });

    expect(progress.totalWorkDays).toBe(0);
    expect(progress.progressPercent).toBe(0);
  });
});
