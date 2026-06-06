import { addDays, addHours, parseISO, startOfDay } from 'date-fns';

export const DEFAULT_IDLE_SLOT_LABEL = 'Idle';
// Off-Day keys are Johannesburg business dates; keep projection independent of the host TZ.
const JOHANNESBURG_MIDNIGHT_OFFSET = '+02:00';
const JOHANNESBURG_UTC_OFFSET_HOURS = 2;

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
  let cursor = workingCalendar
    ? firstWorkingDayOnOrAfter(startOfJohannesburgDay(scheduleOrigin), workingCalendar)
    : startOfDay(scheduleOrigin);

  const projectedSlots = [...slots]
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .map((slot) => {
      const startAt = cursor;
      const endAt = addJobSlotDuration(startAt, slot.durationDays, workingCalendar);
      cursor = firstWorkingDayOnOrAfter(endAt, workingCalendar);

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

export function addJobSlotDuration(startAt: Date, durationDays: number, workingCalendar?: WorkingCalendar): Date {
  if (!workingCalendar) {
    return addDays(startAt, durationDays);
  }

  let cursor = firstWorkingDayOnOrAfter(startOfJohannesburgDay(startAt), workingCalendar);
  let remainingDays = durationDays;

  while (remainingDays > 0) {
    if (isWorkingDay(cursor, workingCalendar)) {
      remainingDays -= 1;
    }

    cursor = addDays(cursor, 1);
  }

  return cursor;
}

export function countWorkingDaysBetween(startAt: Date, endAt: Date, workingCalendar?: WorkingCalendar): number {
  let cursor = workingCalendar
    ? firstWorkingDayOnOrAfter(startOfJohannesburgDay(startAt), workingCalendar)
    : startOfDay(startAt);
  const end = workingCalendar ? startOfJohannesburgDay(endAt) : startOfDay(endAt);
  let count = 0;

  while (cursor < end) {
    if (isWorkingDay(cursor, workingCalendar)) {
      count += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return count;
}

function firstWorkingDayOnOrAfter(date: Date, workingCalendar?: WorkingCalendar): Date {
  let cursor = date;

  while (!isWorkingDay(cursor, workingCalendar)) {
    cursor = addDays(cursor, 1);
  }

  return cursor;
}

function isWorkingDay(date: Date, workingCalendar?: WorkingCalendar): boolean {
  const dateKey = formatJobSchedulingDateKey(date);
  const bayException = workingCalendar?.bayExceptions?.get(dateKey);

  if (bayException) {
    return bayException === 'work';
  }

  return !workingCalendar?.orgOffDays?.has(dateKey);
}

export function formatJobSchedulingDateKey(date: Date): string {
  const johannesburgDate = addHours(date, JOHANNESBURG_UTC_OFFSET_HOURS);
  // Read the shifted instant as UTC so the key is stable in every browser timezone.
  const year = johannesburgDate.getUTCFullYear();
  const month = String(johannesburgDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(johannesburgDate.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function startOfJohannesburgDay(date: Date): Date {
  return parseISO(`${formatJobSchedulingDateKey(date)}T00:00:00.000${JOHANNESBURG_MIDNIGHT_OFFSET}`);
}
