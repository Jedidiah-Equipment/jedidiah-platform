import {
  addDateOnlyDays,
  firstWorkingDayOnOrAfter,
  formatDate,
  type InsertAtDatePlacement,
  isWorkingDay,
  maxDateOnly,
  previewBaySchedule,
  type WorkingCalendar,
} from '@pkg/domain';
import type { BaySchedule, DateOnlyIso, OffDay, ProjectedJobSlot } from '@pkg/schema';

import { getSlotLabel } from './bay-schedule-summary.js';
import { toJobCalendarDateKey } from './job-date-key.js';

export type BookSlotPlacement = InsertAtDatePlacement<ProjectedJobSlot>;

/**
 * Picker bounds for an Insert-at-Date booking: earliest tomorrow (the Slot
 * projected over today is never disturbed), latest the Bay's next available
 * working day (no machine-made idle from date picks). The max doubles as the
 * default value. Values are yyyy-MM-dd strings, matching DatePicker; `today`
 * is the plant business date shipped by the schedule read, never the client clock.
 */
export function getInsertAtDatePickerBounds(
  bay: { nextAvailableDate: DateOnlyIso },
  workingCalendar: WorkingCalendar,
  today: DateOnlyIso,
): { minValue: string; maxValue: string } {
  const tomorrow = addDateOnlyDays(today, 1);
  const latest = firstWorkingDayOnOrAfter(maxDateOnly(bay.nextAvailableDate, tomorrow), workingCalendar);

  return {
    minValue: tomorrow,
    maxValue: latest,
  };
}

/** Matches the Bay's non-working dates (org Off-Days minus Overtime, plus Closures) for the picker. */
export function createBayNonWorkingDateMatcher(workingCalendar: WorkingCalendar): (date: Date) => boolean {
  return (date) => !isWorkingDay(toJobCalendarDateKey(date), workingCalendar);
}

export function resolveBookSlotPlacement({
  bay,
  offDays,
  startDate,
  today,
}: {
  bay: BaySchedule;
  offDays: readonly OffDay[];
  /** The DatePicker's raw value; an empty or unparsable value books a plain append. */
  startDate: string;
  today: DateOnlyIso;
}): BookSlotPlacement {
  // A booking is a single-seed insert: it shares the one preview seam with the ghost preview and the
  // server booking, so the placement they resolve is identical by construction. Seed duration does not
  // affect placement, so a unit seed suffices.
  const [placement] = previewBaySchedule(bay, offDays, {
    kind: 'insertSeeds',
    seeds: [{ durationDays: 1, startDate }],
    today,
  }).placements;

  return placement as BookSlotPlacement;
}

export function describeInsertAtDatePlacement(placement: BookSlotPlacement): {
  startText: string;
  splitWarning: string | null;
} {
  const startText = `Starts ${formatDate(placement.startDate, 'EEE, MMM d')}`;

  if (placement.type !== 'split') {
    return { startText, splitWarning: null };
  }

  const slotName = getSlotLabel(placement.targetSlot);

  return {
    startText,
    splitWarning: `Splits ${slotName}'s ${placement.targetSlot.durationDays}-day slot into ${placement.beforeDays} + ${placement.afterDays}.`,
  };
}
