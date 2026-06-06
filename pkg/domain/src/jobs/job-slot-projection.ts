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
