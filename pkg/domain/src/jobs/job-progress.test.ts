import { DateOnlyIso, UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { deriveJobProgress, deriveJobRouteStop, isJobScheduleComplete, type JobWorkSlotEntry } from './job-progress.js';
import type { WorkingCalendar } from './working-calendar.js';

const day = (value: string) => DateOnlyIso.parse(value);
const uuid = (value: string) => UUID.parse(value);

const BAY_IDS = {
  assembly1: uuid('00000000-0000-4000-8000-000000000003'),
  duplicateA: uuid('00000000-0000-4000-8000-000000000004'),
  duplicateB: uuid('00000000-0000-4000-8000-000000000005'),
  fab1: uuid('00000000-0000-4000-8000-000000000001'),
  paint1: uuid('00000000-0000-4000-8000-000000000002'),
} as const;

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
  bayId: UUID = BAY_IDS.fab1,
): JobWorkSlotEntry => ({
  bayName,
  slot: { bayId, startDate: day(startDate), endDate: day(endDate) },
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
    expect(progress?.currentBayId).toBe(BAY_IDS.fab1);
    expect(progress?.currentBayName).toBe('Fab 1');
    expect(progress?.stageIndex).toBe(1);
    expect(progress?.stageCount).toBe(1);
    // Thu/Fri + Mon/Tue 6–7 = 4 working days through the last work day (Tue 7 Jul).
    expect(progress?.daysLeft).toBe(4);
    expect(progress?.lastWorkDay).toBe('2026-07-07');
  });

  it('reports in-progress when a Slot covers today on an off-day (the Job is still running)', () => {
    // Today Sat 27 Jun is an org off-day; the single Slot covers it (Fri 26 Jun → half-open Fri 3 Jul).
    const progress = deriveJobProgress({
      slots: [entry('Fab 1', '2026-06-26', '2026-07-03')],
      today: day('2026-06-27'),
    });

    expect(progress?.status).toBe('in-progress');
    expect(progress?.currentBayName).toBe('Fab 1');
    expect(progress?.stageIndex).toBe(1);
  });

  it('counts the idle gap working days when all Slots are in the future', () => {
    // Today Thu 2 Jul; the only Slot starts Mon 13 Jul (half-open end Fri 17 Jul).
    const progress = deriveJobProgress({
      slots: [entry('Paint 1', '2026-07-13', '2026-07-17', weekendsOff, BAY_IDS.paint1)],
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

  it('keeps the current Bay id when duplicate Bay names exist', () => {
    const progress = deriveJobProgress({
      slots: [
        entry('Fabrication Bay', '2026-06-15', '2026-06-26', weekendsOff, BAY_IDS.duplicateA),
        entry('Fabrication Bay', '2026-06-29', '2026-07-10', weekendsOff, BAY_IDS.duplicateB),
      ],
      today: day('2026-07-02'),
    });

    expect(progress?.currentBayId).toBe(BAY_IDS.duplicateB);
    expect(progress?.currentBayName).toBe('Fabrication Bay');
    expect(progress?.stageIndex).toBe(2);
  });

  it('paces days-left and the done date by the latest-ending Bay across a multi-Bay Job', () => {
    // Two Bays: Fab finished, Assembly runs latest. Today Thu 2 Jul.
    const progress = deriveJobProgress({
      slots: [
        entry('Fab 1', '2026-06-15', '2026-06-26'), // done before today
        entry('Assembly 1', '2026-06-29', '2026-07-10', weekendsOff, BAY_IDS.assembly1), // active today, ends latest
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
        entry('Paint 1', '2026-07-06', '2026-07-11', weekendsOff, BAY_IDS.paint1), // 5 working days, all ahead
      ],
      today: day('2026-07-02'),
    });

    expect(progress?.overallPercent).toBe(67);
  });

  it('takes days-left from the busiest Bay but the done date from the latest-ending Bay', () => {
    // Today Thu 2 Jul. The later-ending Slot sits on a Bay closed through mid-July, so it counts
    // fewer working days than the earlier-ending Slot. Days-left is the max over Slots (the busy
    // Bay), but the done date must follow the latest-ending Slot — when the Job is fully off the
    // floor — so the board never claims the Job ends before a later route stop.
    const bayMostlyClosed: WorkingCalendar = {
      orgOffDays: new Set([
        '2026-07-04',
        '2026-07-05',
        '2026-07-06',
        '2026-07-07',
        '2026-07-08',
        '2026-07-09',
        '2026-07-10',
        '2026-07-11',
        '2026-07-12',
        '2026-07-13',
        '2026-07-14',
        '2026-07-15',
      ]),
    };
    const progress = deriveJobProgress({
      slots: [
        entry('Paint 1', '2026-06-29', '2026-07-15', weekendsOff, BAY_IDS.paint1), // ends 14 Jul, 9 working days
        entry('Assembly 1', '2026-06-29', '2026-07-17', bayMostlyClosed, BAY_IDS.assembly1), // ends 16 Jul, only 3 working days
      ],
      today: day('2026-07-02'),
    });

    // Paint paces days-left with 9 working days (2,3, 6,7,8,9,10, 13,14), but Assembly ends latest,
    // so the done date is its last work day (Thu 16 Jul) — the Job is on the floor until then.
    expect(progress?.daysLeft).toBe(9);
    expect(progress?.lastWorkDay).toBe('2026-07-16');
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

describe('deriveJobRouteStop', () => {
  it('marks a Slot done once its last work day is before today', () => {
    // Half-open end Sat 27 Jun → last work day Fri 26 Jun, before today Thu 2 Jul.
    const stop = deriveJobRouteStop({
      slot: { startDate: day('2026-06-15'), endDate: day('2026-06-27') },
      today: day('2026-07-02'),
      workingCalendar: weekendsOff,
    });

    expect(stop.state).toBe('done');
    expect(stop.remainingWorkDays).toBe(0);
    expect(stop.progressPercent).toBe(100);
    expect(stop.lastWorkDay).toBe('2026-06-26');
  });

  it('marks a Slot active when today falls within it on a working day', () => {
    const stop = deriveJobRouteStop({
      slot: { startDate: day('2026-06-29'), endDate: day('2026-07-10') },
      today: day('2026-07-02'),
      workingCalendar: weekendsOff,
    });

    expect(stop.state).toBe('active');
    // Thu/Fri + Mon–Thu 6–9 = 6 working days through the last work day (Thu 9 Jul).
    expect(stop.remainingWorkDays).toBe(6);
    expect(stop.lastWorkDay).toBe('2026-07-09');
  });

  it('marks a Slot scheduled when it starts after today', () => {
    const stop = deriveJobRouteStop({
      slot: { startDate: day('2026-07-13'), endDate: day('2026-07-17') },
      today: day('2026-07-02'),
      workingCalendar: weekendsOff,
    });

    expect(stop.state).toBe('scheduled');
    expect(stop.progressPercent).toBe(0);
    expect(stop.workDays).toBe(4);
  });

  it('marks a Slot covering an off-day today as active (the Job is still in progress)', () => {
    // Today Sat 27 Jun is an org off-day; the Slot covers it, so the Job is in progress.
    const stop = deriveJobRouteStop({
      slot: { startDate: day('2026-06-26'), endDate: day('2026-07-03') },
      today: day('2026-06-27'),
      workingCalendar: weekendsOff,
    });

    expect(stop.state).toBe('active');
  });
});

describe('isJobScheduleComplete', () => {
  it('is complete when every Slot is done', () => {
    expect(isJobScheduleComplete({ done: 3, total: 3 })).toBe(true);
  });

  it('is not complete while any Slot is still active or scheduled', () => {
    expect(isJobScheduleComplete({ done: 2, total: 3 })).toBe(false);
  });

  it('is not complete for a Job with no Work Slot', () => {
    expect(isJobScheduleComplete({ done: 0, total: 0 })).toBe(false);
  });
});
