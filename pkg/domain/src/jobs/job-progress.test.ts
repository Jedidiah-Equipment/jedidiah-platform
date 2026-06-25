import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { deriveJobProgress, type JobWorkSlotEntry } from './job-progress.js';
import type { WorkingCalendar } from './working-calendar.js';

const day = (value: string) => DateOnlyIso.parse(value);

// Weekends across late June / July 2026 as org off-days, so working-day arithmetic is exercised.
const weekendsOff: WorkingCalendar = {
  orgOffDays: new Set([
    '2026-06-20',
    '2026-06-21',
    '2026-06-27',
    '2026-06-28',
    '2026-07-04',
    '2026-07-05',
    '2026-07-11',
    '2026-07-12',
    '2026-07-18',
    '2026-07-19',
  ]),
};

const entry = (
  bayName: string,
  startDate: string,
  endDate: string,
  workingCalendar: WorkingCalendar = weekendsOff,
): JobWorkSlotEntry => ({
  bayName,
  slot: { startDate: day(startDate), endDate: day(endDate) },
  workingCalendar,
});

describe('deriveJobProgress', () => {
  it('reports in-progress with the active Bay when a Slot runs today', () => {
    // Single Bay slot Mon 15 Jun → half-open Wed 8 Jul. Today Thu 2 Jul.
    const progress = deriveJobProgress({
      slots: [entry('Fab 1', '2026-06-15', '2026-07-08')],
      today: day('2026-07-02'),
    });

    expect(progress).not.toBeNull();
    expect(progress?.status).toBe('in-progress');
    expect(progress?.currentBayName).toBe('Fab 1');
    expect(progress?.stageIndex).toBe(1);
    expect(progress?.stageCount).toBe(1);
    // Thu/Fri + Mon/Tue 6–7 = 4 working days through the last work day (Tue 7 Jul).
    expect(progress?.daysLeft).toBe(4);
    expect(progress?.lastWorkDay).toBe('2026-07-07');
  });

  it('counts the idle gap working days when all Slots are in the future', () => {
    // Today Thu 2 Jul; the only Slot starts Mon 13 Jul (half-open end Fri 17 Jul).
    const progress = deriveJobProgress({
      slots: [entry('Paint 1', '2026-07-13', '2026-07-17')],
      today: day('2026-07-02'),
    });

    expect(progress?.status).toBe('scheduled');
    expect(progress?.currentBayName).toBe('Paint 1');
    // Working days today → last work day (Thu 16 Jul), spanning the idle gap before the Slot:
    // 2,3, 6,7,8,9,10, 13,14,15,16 = 11 working days.
    expect(progress?.daysLeft).toBe(11);
    expect(progress?.lastWorkDay).toBe('2026-07-16');
    expect(progress?.overallPercent).toBe(0);
  });

  it('paces days-left and the done date by the latest-ending Bay across a multi-Bay Job', () => {
    // Two Bays: Fab finished, Assembly runs latest. Today Thu 2 Jul.
    const progress = deriveJobProgress({
      slots: [
        entry('Fab 1', '2026-06-15', '2026-06-26'), // done before today
        entry('Assembly 1', '2026-06-29', '2026-07-10'), // active today, ends latest
      ],
      today: day('2026-07-02'),
    });

    expect(progress?.status).toBe('in-progress');
    expect(progress?.currentBayName).toBe('Assembly 1');
    expect(progress?.stageIndex).toBe(2);
    expect(progress?.stageCount).toBe(2);
    // Days-left tracks the Assembly slot's end (half-open Fri 10 Jul → last work day Thu 9 Jul):
    // 2,3, 6,7,8,9 = 6 working days.
    expect(progress?.daysLeft).toBe(6);
    expect(progress?.lastWorkDay).toBe('2026-07-09');
  });

  it('weights overall percent by working days across uneven Slots', () => {
    // Stage 1 (10 work days) fully done; stage 2 (5 work days) starts tomorrow → 0 elapsed.
    // Elapsed 10 of 15 total = 67%.
    const progress = deriveJobProgress({
      slots: [
        entry('Fab 1', '2026-06-15', '2026-06-27'), // Mon 15 → 10 working days, ends before today
        entry('Paint 1', '2026-07-06', '2026-07-11'), // 5 working days, all ahead
      ],
      today: day('2026-07-02'),
    });

    expect(progress?.overallPercent).toBe(67);
  });

  it('returns null when every Slot is finished', () => {
    const progress = deriveJobProgress({
      slots: [entry('Fab 1', '2026-06-15', '2026-06-27')],
      today: day('2026-07-02'),
    });

    expect(progress).toBeNull();
  });

  it('returns null when given no Slots', () => {
    expect(deriveJobProgress({ slots: [], today: day('2026-07-02') })).toBeNull();
  });
});
