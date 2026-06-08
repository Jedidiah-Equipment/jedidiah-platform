import { addDays } from 'date-fns';

import { johannesburgDayStart, toJohannesburgDateKey } from '../formatting/date.js';

export const DEFAULT_IDLE_SLOT_LABEL = 'Idle';
export { toJohannesburgDateKey as formatJobSchedulingDateKey } from '../formatting/date.js';

export type ProjectableJobSlot = {
  durationDays: number;
  id: string;
  sequence: number;
};

export type WorkingCalendarDayDirection = 'work' | 'off';

export type WorkingCalendar = {
  bayExceptions?: ReadonlyMap<string, WorkingCalendarDayDirection>;
  orgOffDays?: ReadonlySet<string>;
};

export type ProjectedSlot<TSlot extends ProjectableJobSlot> = TSlot & {
  endAt: Date;
  startAt: Date;
};

export type SlotProjectionResult<TSlot extends ProjectableJobSlot> = {
  nextAvailableAt: Date;
  slots: ProjectedSlot<TSlot>[];
};

export function projectJobSlots<TSlot extends ProjectableJobSlot>({
  scheduleOrigin,
  slots,
  workingCalendar,
}: {
  scheduleOrigin: Date;
  slots: readonly TSlot[];
  workingCalendar?: WorkingCalendar;
}): SlotProjectionResult<TSlot> {
  const resolvedWorkingCalendar = workingCalendar ?? {};
  let cursor = firstWorkingDayOnOrAfter(johannesburgDayStart(scheduleOrigin), resolvedWorkingCalendar);

  const projectedSlots = [...slots]
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .map((slot) => {
      const startAt = cursor;
      const endAt = addJobSlotDuration(startAt, slot.durationDays, resolvedWorkingCalendar);
      cursor = firstWorkingDayOnOrAfter(endAt, resolvedWorkingCalendar);

      return {
        ...slot,
        startAt,
        endAt,
      };
    });

  return {
    nextAvailableAt: cursor,
    slots: projectedSlots,
  };
}

export function addJobSlotDuration(startAt: Date, durationDays: number, workingCalendar: WorkingCalendar = {}): Date {
  let cursor = firstWorkingDayOnOrAfter(johannesburgDayStart(startAt), workingCalendar);
  let remainingDays = durationDays;

  while (remainingDays > 0) {
    if (isWorkingDay(cursor, workingCalendar)) {
      remainingDays -= 1;
    }

    cursor = addDays(cursor, 1);
  }

  return cursor;
}

export function countWorkingDaysBetween(startAt: Date, endAt: Date, workingCalendar: WorkingCalendar = {}): number {
  let cursor = firstWorkingDayOnOrAfter(johannesburgDayStart(startAt), workingCalendar);
  const end = johannesburgDayStart(endAt);
  let count = 0;

  while (cursor < end) {
    if (isWorkingDay(cursor, workingCalendar)) {
      count += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return count;
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
 * The span is half-open `[startAt, endAt)`, matching {@link projectJobSlots} output.
 */
export function summarizeSlotCalendarDays(
  startAt: Date,
  endAt: Date,
  workingCalendar: WorkingCalendar = {},
): SlotCalendarDays {
  let cursor = johannesburgDayStart(startAt);
  const end = johannesburgDayStart(endAt);
  let workingDays = 0;
  let closureDays = 0;
  let overtimeDays = 0;

  while (cursor < end) {
    const dateKey = toJohannesburgDateKey(cursor);
    const bayException = workingCalendar.bayExceptions?.get(dateKey);
    const isOrgOffDay = workingCalendar.orgOffDays?.has(dateKey) ?? false;

    if (isWorkingDay(cursor, workingCalendar)) {
      workingDays += 1;

      if (bayException === 'work' && isOrgOffDay) {
        overtimeDays += 1;
      }
    } else {
      closureDays += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return { workingDays, closureDays, overtimeDays };
}

function firstWorkingDayOnOrAfter(date: Date, workingCalendar: WorkingCalendar): Date {
  let cursor = date;

  while (!isWorkingDay(cursor, workingCalendar)) {
    cursor = addDays(cursor, 1);
  }

  return cursor;
}

function isWorkingDay(date: Date, workingCalendar: WorkingCalendar): boolean {
  const dateKey = toJohannesburgDateKey(date);
  const bayException = workingCalendar.bayExceptions?.get(dateKey);

  if (bayException) {
    return bayException === 'work';
  }

  return !workingCalendar.orgOffDays?.has(dateKey);
}
