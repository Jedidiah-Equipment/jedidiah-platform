import { addDateOnlyDays, parseDateOnlyParts } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';

export const BAY_SCHEDULE_HISTORY_BACK_CONTEXT_DAYS = 14;
export const BAY_SCHEDULE_HISTORY_EXTENSION_DEBOUNCE_MS = 250;

export function getInitialBayScheduleHistoryFloor(today: DateOnlyIso): DateOnlyIso {
  return startOfBayScheduleHistoryMonth(addDateOnlyDays(today, -BAY_SCHEDULE_HISTORY_BACK_CONTEXT_DAYS));
}

export function getNextBayScheduleHistoryFloor(currentFloor: DateOnlyIso, viewportStart: DateOnlyIso): DateOnlyIso {
  const currentBucket = startOfBayScheduleHistoryMonth(currentFloor);
  const viewportBucket = startOfBayScheduleHistoryMonth(viewportStart);

  if (viewportBucket >= currentBucket) {
    return currentBucket;
  }

  return addBayScheduleHistoryMonths(currentBucket, -1);
}

export function startOfBayScheduleHistoryMonth(date: DateOnlyIso): DateOnlyIso {
  const { month, year } = parseDateOnlyParts(date);

  return toDateOnlyParts(year, month, 1);
}

function addBayScheduleHistoryMonths(date: DateOnlyIso, monthOffset: number): DateOnlyIso {
  const { month, year } = parseDateOnlyParts(date);
  const monthIndex = year * 12 + (month - 1) + monthOffset;
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = positiveModulo(monthIndex, 12) + 1;

  return toDateOnlyParts(nextYear, nextMonth, 1);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function toDateOnlyParts(year: number, month: number, day: number): DateOnlyIso {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateOnlyIso;
}
