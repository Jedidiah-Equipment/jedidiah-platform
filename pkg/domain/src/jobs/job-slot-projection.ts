import type { DateOnlyIso } from '@pkg/schema';

import { addDateOnlyDays } from '../formatting/date-only.js';
import {
  firstWorkingDayOnOrAfter,
  isWorkingDay,
  lastWorkingDayOnOrBefore,
  type WorkingCalendar,
} from './working-calendar.js';

export const DEFAULT_IDLE_SLOT_LABEL = 'Idle';

export type ProjectableJobSlot = {
  durationDays: number;
  id: string;
  sequence: number;
};

export type ProjectedSlot<TSlot extends ProjectableJobSlot> = TSlot & {
  endDate: DateOnlyIso;
  /** Inclusive first working day — the label answer; `startDate` can open on an off-day. */
  firstWorkDay: DateOnlyIso;
  /** Inclusive last working day — the label answer; the half-open `endDate` is the day after it. */
  lastWorkDay: DateOnlyIso;
  startDate: DateOnlyIso;
};

export type SlotProjectionResult<TSlot extends ProjectableJobSlot> = {
  nextAvailableDate: DateOnlyIso;
  slots: ProjectedSlot<TSlot>[];
};

export function projectJobSlots<TSlot extends ProjectableJobSlot>({
  scheduleOrigin,
  slots,
  workingCalendar,
}: {
  scheduleOrigin: DateOnlyIso;
  slots: readonly TSlot[];
  workingCalendar?: WorkingCalendar;
}): SlotProjectionResult<TSlot> {
  const resolvedWorkingCalendar = workingCalendar ?? {};
  let cursor = scheduleOrigin;

  const projectedSlots = [...slots]
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .map((slot) => {
      const startDate = cursor;
      const endDate = addJobSlotDuration(startDate, slot.durationDays, resolvedWorkingCalendar);
      // Slots are a contiguous queue visually, even when the boundary falls on an off-day.
      cursor = endDate;

      return {
        ...slot,
        startDate,
        endDate,
        ...labelWorkDays(startDate, endDate, resolvedWorkingCalendar),
      };
    });

  return {
    nextAvailableDate: cursor,
    slots: projectedSlots,
  };
}

export function addJobSlotDuration(
  startDate: DateOnlyIso,
  durationDays: number,
  workingCalendar: WorkingCalendar = {},
): DateOnlyIso {
  let cursor = firstWorkingDayOnOrAfter(startDate, workingCalendar);
  let remainingDays = durationDays;

  while (remainingDays > 0) {
    if (isWorkingDay(cursor, workingCalendar)) {
      remainingDays -= 1;
    }

    cursor = addDateOnlyDays(cursor, 1);
  }

  return cursor;
}

export type SlotLabelWorkDays = {
  firstWorkDay: DateOnlyIso;
  lastWorkDay: DateOnlyIso;
};

/**
 * The inclusive working days a span covers, for date labels. A span opens on the previous Slot's
 * boundary, which can be an off-day, so the first working day snaps forward. The last working day
 * walks back from the day before the half-open `endDate`; projection stops the cursor right after
 * the last consumed working day, so for projected spans the walk is a no-op — it is not assumed.
 */
export function labelWorkDays(
  startDate: DateOnlyIso,
  endDate: DateOnlyIso,
  workingCalendar: WorkingCalendar,
): SlotLabelWorkDays {
  return {
    firstWorkDay: firstWorkingDayOnOrAfter(startDate, workingCalendar),
    lastWorkDay: lastWorkingDayOnOrBefore(addDateOnlyDays(endDate, -1), workingCalendar),
  };
}

export type SlotCalendarDays = {
  /** Working days the slot consumes (matches the slot duration). */
  workingDays: number;
  /** Non-working calendar days that fall inside the slot span (off-days, bay closures). */
  closureDays: number;
  /** Working days that exist only because a bay exception opened an otherwise-off day. */
  overtimeDays: number;
};

/**
 * Breaks a projected slot span into its working, closure, and overtime day counts.
 * The span is half-open `[startDate, endDate)`, matching {@link projectJobSlots} output.
 */
export function summarizeSlotCalendarDays(
  startDate: DateOnlyIso,
  endDate: DateOnlyIso,
  workingCalendar: WorkingCalendar = {},
): SlotCalendarDays {
  let cursor = startDate;
  let workingDays = 0;
  let closureDays = 0;
  let overtimeDays = 0;

  while (cursor < endDate) {
    const bayException = workingCalendar.bayExceptions?.get(cursor);
    const isOrgOffDay = workingCalendar.orgOffDays?.has(cursor) ?? false;

    if (isWorkingDay(cursor, workingCalendar)) {
      workingDays += 1;

      if (bayException === 'work' && isOrgOffDay) {
        overtimeDays += 1;
      }
    } else {
      closureDays += 1;
    }

    cursor = addDateOnlyDays(cursor, 1);
  }

  return { workingDays, closureDays, overtimeDays };
}

export type SlotCalendarDayKind = 'working' | 'closure' | 'overtime';

export type SlotCalendarDaySegment = {
  kind: SlotCalendarDayKind;
  startDate: DateOnlyIso;
  endDate: DateOnlyIso;
};

/**
 * Splits a projected slot span into contiguous day segments classified as working,
 * closure (non-working day inside the span), or overtime (a working day that only exists
 * because a bay exception opened an org off-day). Consecutive same-kind days are merged.
 * The span is half-open `[startDate, endDate)`, matching {@link projectJobSlots} output and
 * the day counts from {@link summarizeSlotCalendarDays}.
 */
export function segmentSlotCalendarDays(
  startDate: DateOnlyIso,
  endDate: DateOnlyIso,
  workingCalendar: WorkingCalendar = {},
): SlotCalendarDaySegment[] {
  let cursor = startDate;
  const segments: SlotCalendarDaySegment[] = [];

  while (cursor < endDate) {
    const bayException = workingCalendar.bayExceptions?.get(cursor);
    const isOrgOffDay = workingCalendar.orgOffDays?.has(cursor) ?? false;

    let kind: SlotCalendarDayKind;
    if (!isWorkingDay(cursor, workingCalendar)) {
      kind = 'closure';
    } else if (bayException === 'work' && isOrgOffDay) {
      kind = 'overtime';
    } else {
      kind = 'working';
    }

    const nextDay = addDateOnlyDays(cursor, 1);
    const previous = segments.at(-1);

    if (previous && previous.kind === kind) {
      previous.endDate = nextDay;
    } else {
      segments.push({ endDate: nextDay, kind, startDate: cursor });
    }

    cursor = nextDay;
  }

  return segments;
}
