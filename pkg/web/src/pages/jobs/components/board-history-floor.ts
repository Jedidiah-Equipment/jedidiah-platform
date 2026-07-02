import { addDateOnlyDays, parseDateOnlyParts } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';

export const BOARD_HISTORY_BACK_CONTEXT_DAYS = 14;
export const BOARD_HISTORY_EXTENSION_DEBOUNCE_MS = 250;

export function getInitialBoardHistoryFloor(today: DateOnlyIso): DateOnlyIso {
  return startOfBoardHistoryMonth(addDateOnlyDays(today, -BOARD_HISTORY_BACK_CONTEXT_DAYS));
}

export function getNextBoardHistoryFloor(currentFloor: DateOnlyIso, viewportStart: DateOnlyIso): DateOnlyIso {
  const currentBucket = startOfBoardHistoryMonth(currentFloor);
  const viewportBucket = startOfBoardHistoryMonth(viewportStart);

  if (viewportBucket >= currentBucket) {
    return currentBucket;
  }

  return addBoardHistoryMonths(currentBucket, -1);
}

export function startOfBoardHistoryMonth(date: DateOnlyIso): DateOnlyIso {
  const { month, year } = parseDateOnlyParts(date);

  return toDateOnlyParts(year, month, 1);
}

function addBoardHistoryMonths(date: DateOnlyIso, monthOffset: number): DateOnlyIso {
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
