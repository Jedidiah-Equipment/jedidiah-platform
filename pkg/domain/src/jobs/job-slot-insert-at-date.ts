import type { DateOnlyIso } from '@pkg/schema';

import { addDateOnlyDays, maxDateOnly } from '../formatting/date-only.js';
import { type ProjectableJobSlot, type ProjectedSlot, projectJobSlots } from './job-slot-projection.js';
import { countWorkingDaysBetween, firstWorkingDayOnOrAfter, type WorkingCalendar } from './working-calendar.js';

export type InsertAtDatePlacement<TSlot extends ProjectableJobSlot> =
  /** `idleGapDays` is the idle filler owed between a past queue end and the start (0 when the queue reaches today). */
  | { type: 'append'; startDate: DateOnlyIso; idleGapDays: number }
  | { type: 'insert-before'; targetSlot: ProjectedSlot<TSlot>; startDate: DateOnlyIso }
  | { type: 'split'; targetSlot: ProjectedSlot<TSlot>; beforeDays: number; afterDays: number; startDate: DateOnlyIso };

/**
 * Resolves an Insert-at-Date placement hint into a Bay Queue position (ADR-0042).
 * The picked date is never stored: it is floored to tomorrow (the Slot projected
 * over today is never disturbed), normalized forward to a working day, and then
 * compared against the live projection — on or past the next available day it
 * clamps to a plain append (never fabricating idle), on a Slot's projected start
 * it inserts cleanly before, and strictly inside a Slot it splits that Slot into
 * two halves whose working days sum to the original. No picked date means a
 * plain append, so date-less bookings share the same placement contract.
 */
export function resolveInsertAtDatePlacement<TSlot extends ProjectableJobSlot>({
  currentDate,
  pickedDate,
  scheduleOrigin,
  slots,
  workingCalendar,
}: {
  currentDate: DateOnlyIso;
  pickedDate?: DateOnlyIso | undefined;
  scheduleOrigin: DateOnlyIso;
  slots: readonly TSlot[];
  workingCalendar?: WorkingCalendar;
}): InsertAtDatePlacement<TSlot> {
  const calendar = workingCalendar ?? {};

  const projection = projectJobSlots({ scheduleOrigin, slots, workingCalendar: calendar });
  const appendPlacement: InsertAtDatePlacement<TSlot> = {
    type: 'append',
    startDate: firstWorkingDayOnOrAfter(maxDateOnly(projection.nextAvailableDate, currentDate), calendar),
    idleGapDays: countWorkingDaysBetween(projection.nextAvailableDate, currentDate, calendar),
  };

  if (pickedDate === undefined) {
    return appendPlacement;
  }

  const tomorrow = addDateOnlyDays(currentDate, 1);
  const floored = maxDateOnly(pickedDate, tomorrow);
  const effectiveDate = firstWorkingDayOnOrAfter(floored, calendar);

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
