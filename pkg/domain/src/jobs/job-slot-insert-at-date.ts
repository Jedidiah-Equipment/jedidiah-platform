import type { DateOnlyIso } from '@pkg/schema';

import { addDateOnlyDays, maxDateOnly } from '../formatting/date-only.js';
import {
  countWorkingDaysBetween,
  firstWorkingDayOnOrAfter,
  type ProjectableJobSlot,
  type ProjectedSlot,
  projectJobSlots,
  type WorkingCalendar,
} from './job-slot-projection.js';

export type InsertAtDatePlacement<TSlot extends ProjectableJobSlot> =
  | { type: 'append'; startDate: DateOnlyIso }
  | { type: 'insert-before'; targetSlot: ProjectedSlot<TSlot>; startDate: DateOnlyIso }
  | { type: 'split'; targetSlot: ProjectedSlot<TSlot>; beforeDays: number; afterDays: number; startDate: DateOnlyIso };

/**
 * Resolves an Insert-at-Date placement hint into a Bay Queue position (ADR-0042).
 * The picked date is never stored: it is floored to tomorrow (the Slot projected
 * over today is never disturbed), normalized forward to a working day, and then
 * compared against the live projection — on or past the next available day it
 * clamps to a plain append (never fabricating idle), on a Slot's projected start
 * it inserts cleanly before, and strictly inside a Slot it splits that Slot into
 * two halves whose working days sum to the original.
 */
export function resolveInsertAtDatePlacement<TSlot extends ProjectableJobSlot>({
  currentDate,
  pickedDate,
  scheduleOrigin,
  slots,
  workingCalendar,
}: {
  currentDate: DateOnlyIso;
  pickedDate: DateOnlyIso;
  scheduleOrigin: DateOnlyIso;
  slots: readonly TSlot[];
  workingCalendar?: WorkingCalendar;
}): InsertAtDatePlacement<TSlot> {
  const calendar = workingCalendar ?? {};
  const tomorrow = addDateOnlyDays(currentDate, 1);
  const floored = maxDateOnly(pickedDate, tomorrow);
  const effectiveDate = firstWorkingDayOnOrAfter(floored, calendar);

  const projection = projectJobSlots({ scheduleOrigin, slots, workingCalendar: calendar });
  const appendPlacement: InsertAtDatePlacement<TSlot> = {
    type: 'append',
    startDate: firstWorkingDayOnOrAfter(maxDateOnly(projection.nextAvailableDate, currentDate), calendar),
  };

  if (effectiveDate >= firstWorkingDayOnOrAfter(projection.nextAvailableDate, calendar)) {
    return appendPlacement;
  }

  for (const targetSlot of projection.slots) {
    if (targetSlot.endDate <= effectiveDate) {
      continue;
    }

    // The projection cursor can rest on an off-day, so a Slot's honest start is
    // its first working day — a pick landing there inserts cleanly before it.
    const slotStartDate = firstWorkingDayOnOrAfter(targetSlot.startDate, calendar);

    if (effectiveDate <= slotStartDate) {
      return { type: 'insert-before', targetSlot, startDate: slotStartDate };
    }

    const beforeDays = countWorkingDaysBetween(targetSlot.startDate, effectiveDate, calendar);

    if (beforeDays <= 0) {
      return { type: 'insert-before', targetSlot, startDate: slotStartDate };
    }

    if (beforeDays >= targetSlot.durationDays) {
      continue;
    }

    return {
      type: 'split',
      targetSlot,
      beforeDays,
      afterDays: targetSlot.durationDays - beforeDays,
      startDate: effectiveDate,
    };
  }

  return appendPlacement;
}
