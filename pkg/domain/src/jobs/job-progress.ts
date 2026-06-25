import type { DateOnlyIso, ProjectedWorkJobSlot } from '@pkg/schema';

import { deriveActiveJobProgress } from './bay-active-job.js';
import { countWorkingDaysBetween, isWorkingDay, type WorkingCalendar } from './working-calendar.js';

/**
 * One of a Job's Work Slots paired with the Bay it runs in. Each Bay carries its own
 * working calendar (org Off-Days overlaid with the Bay's Calendar Exceptions), so a Job
 * spanning several Bays must keep them per Slot rather than sharing one calendar.
 */
export type JobWorkSlotEntry = {
  slot: Pick<ProjectedWorkJobSlot, 'startDate' | 'endDate'>;
  bayName: string;
  workingCalendar: WorkingCalendar;
};

/**
 * A Job's board state, projected once and shared by the mobile Job List card and the Job
 * Detail header so the two never disagree.
 *
 * Slot spans are half-open `[startDate, endDate)`. A Slot is unfinished while `endDate >
 * today`; a Job with no unfinished Slot has dropped off the board (this returns `null`).
 */
export type JobProgress = {
  /**
   * The Job-level horizon: the maximum, over the Job's unfinished Slots, of the working
   * days from today through that Slot's last work day. Counts the working days in any idle
   * gap before a not-yet-started Slot, and only working days on each Slot's Bay calendar.
   */
  daysLeft: number;
  /** 'in-progress' when a Slot runs today; 'scheduled' when the Job's work is all ahead. */
  status: 'in-progress' | 'scheduled';
  /** The Bay running today, or the next Bay to start when none is active. */
  currentBayName: string;
  /** 1-based position of the current Slot in the Job's route. */
  stageIndex: number;
  /** Total Slots in the Job's route (its full set of Bays). */
  stageCount: number;
  /** Work-day-weighted elapsed share across the whole route, 0–100, rounded. */
  overallPercent: number;
  /** Inclusive last work day of the latest-ending unfinished Slot — when the Job is fully off the floor. */
  lastWorkDay: DateOnlyIso;
};

/**
 * Projects a Job's board state from its Work Slots and plant "today". Returns `null` when
 * the Job has no unfinished Slot, which is the signal the Job List uses to drop fully-past
 * Jobs. `daysLeft` is paced by the latest-ending Bay (idle-gap working days included),
 * while `overallPercent` weights elapsed work across every Slot in the route.
 */
export function deriveJobProgress({
  slots,
  today,
}: {
  slots: readonly JobWorkSlotEntry[];
  today: DateOnlyIso;
}): JobProgress | null {
  if (slots.length === 0) return null;

  // Route order: by Slot start, then end, then Bay name, so the stage index and the
  // active/next pick are stable regardless of the input order.
  const ordered = [...slots].sort(
    (left, right) =>
      left.slot.startDate.localeCompare(right.slot.startDate) ||
      left.slot.endDate.localeCompare(right.slot.endDate) ||
      left.bayName.localeCompare(right.bayName),
  );

  const unfinished = ordered.filter((entry) => entry.slot.endDate > today);
  // The soonest unfinished Slot to start; `ordered` is start-ascending, so it leads the list.
  const [firstUnfinished] = unfinished;
  if (!firstUnfinished) return null;

  // The Slot running today (covers today on a working day, mirroring findActiveWorkSlot).
  const active = unfinished.find(
    (entry) =>
      entry.slot.startDate <= today && today < entry.slot.endDate && isWorkingDay(today, entry.workingCalendar),
  );
  // Current stage: the active Slot, else the soonest unfinished Slot to start.
  const current = active ?? firstUnfinished;

  // Days-left is paced by the latest-ending Slot, counting today through its last work day
  // on that Bay's calendar (idle-gap working days included — never clamped to the Slot span).
  let daysLeft = 0;
  let latest = firstUnfinished;
  for (const entry of unfinished) {
    const slotDaysLeft = countWorkingDaysBetween(today, entry.slot.endDate, entry.workingCalendar);
    if (slotDaysLeft > daysLeft) daysLeft = slotDaysLeft;
    if (entry.slot.endDate > latest.slot.endDate) latest = entry;
  }

  // Overall progress weights elapsed work days across the whole route, so uneven Slots and
  // already-finished Bays count toward the bar. Per-Slot clamping keeps future Slots at 0%.
  let totalWorkDays = 0;
  let elapsedWorkDays = 0;
  for (const entry of ordered) {
    const progress = deriveActiveJobProgress({ slot: entry.slot, today, workingCalendar: entry.workingCalendar });
    totalWorkDays += progress.totalWorkDays;
    elapsedWorkDays += progress.elapsedWorkDays;
  }

  return {
    daysLeft,
    status: active ? 'in-progress' : 'scheduled',
    currentBayName: current.bayName,
    stageIndex: ordered.indexOf(current) + 1,
    stageCount: ordered.length,
    overallPercent: totalWorkDays === 0 ? 0 : Math.round((elapsedWorkDays / totalWorkDays) * 100),
    lastWorkDay: deriveActiveJobProgress({ slot: latest.slot, today, workingCalendar: latest.workingCalendar })
      .lastWorkDay,
  };
}
