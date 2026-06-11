import { addDays } from 'date-fns';

import { johannesburgDayStart } from '../formatting/date.js';
import {
  countWorkingDaysBetween,
  firstWorkingDayOnOrAfter,
  type ProjectableJobSlot,
  type ProjectedSlot,
  projectJobSlots,
  type WorkingCalendar,
} from './job-slot-projection.js';

export type InsertAtDatePlacement<TSlot extends ProjectableJobSlot> =
  | { type: 'append'; startAt: Date }
  | { type: 'insert-before'; targetSlot: ProjectedSlot<TSlot>; startAt: Date }
  | { type: 'split'; targetSlot: ProjectedSlot<TSlot>; beforeDays: number; afterDays: number; startAt: Date };

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
  currentDate: Date;
  pickedDate: Date;
  scheduleOrigin: Date;
  slots: readonly TSlot[];
  workingCalendar?: WorkingCalendar;
}): InsertAtDatePlacement<TSlot> {
  const calendar = workingCalendar ?? {};
  const tomorrow = addDays(johannesburgDayStart(currentDate), 1);
  const floored = johannesburgDayStart(pickedDate) < tomorrow ? tomorrow : johannesburgDayStart(pickedDate);
  const effectiveDate = firstWorkingDayOnOrAfter(floored, calendar);

  const projection = projectJobSlots({ scheduleOrigin, slots, workingCalendar: calendar });
  const appendPlacement: InsertAtDatePlacement<TSlot> = {
    type: 'append',
    startAt: firstWorkingDayOnOrAfter(
      projection.nextAvailableAt < johannesburgDayStart(currentDate)
        ? johannesburgDayStart(currentDate)
        : projection.nextAvailableAt,
      calendar,
    ),
  };

  if (effectiveDate >= firstWorkingDayOnOrAfter(projection.nextAvailableAt, calendar)) {
    return appendPlacement;
  }

  for (const targetSlot of projection.slots) {
    if (targetSlot.endAt <= effectiveDate) {
      continue;
    }

    // The projection cursor can rest on an off-day, so a Slot's honest start is
    // its first working day — a pick landing there inserts cleanly before it.
    const slotStartAt = firstWorkingDayOnOrAfter(targetSlot.startAt, calendar);

    if (effectiveDate <= slotStartAt) {
      return { type: 'insert-before', targetSlot, startAt: slotStartAt };
    }

    const beforeDays = countWorkingDaysBetween(targetSlot.startAt, effectiveDate, calendar);

    if (beforeDays <= 0) {
      return { type: 'insert-before', targetSlot, startAt: slotStartAt };
    }

    if (beforeDays >= targetSlot.durationDays) {
      continue;
    }

    return {
      type: 'split',
      targetSlot,
      beforeDays,
      afterDays: targetSlot.durationDays - beforeDays,
      startAt: effectiveDate,
    };
  }

  return appendPlacement;
}
