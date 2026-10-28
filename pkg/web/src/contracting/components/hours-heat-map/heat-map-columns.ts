import { addDateOnlyDays, diffDateOnlyDays, parseDateOnlyParts, startOfDateOnlyWeek } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';
import type { DailyHoursDay } from '@pkg/schema/contracting';

/** One Monday-first week of the grid: seven slots, null outside the range, and the date whose month labels it. */
export type HeatMapColumn = { days: (DailyHoursDay | null)[]; labelDate: DailyHoursDay['date'] | null };

/**
 * Lays the days out as whole weeks, Monday first. A column is labelled with its month when it holds a 1st; the first
 * column is labelled too unless the second one opens a month, so two labels never share the space of one.
 */
export function heatMapColumns(days: readonly DailyHoursDay[]): HeatMapColumn[] {
  const first = days[0];
  if (!first) return [];
  const leading = diffDateOnlyDays(first.date, startOfDateOnlyWeek(first.date));
  const slots = [...Array<null>(leading).fill(null), ...days];
  const columns: HeatMapColumn[] = [];
  for (let index = 0; index < slots.length; index += 7) {
    const week = Array.from({ length: 7 }, (_, offset) => slots[index + offset] ?? null);
    const opening = week.find((day) => day !== null && parseDateOnlyParts(day.date).day === 1);
    columns.push({ days: week, labelDate: opening?.date ?? null });
  }
  const [firstColumn, secondColumn] = columns;
  if (firstColumn && !firstColumn.labelDate && !secondColumn?.labelDate) firstColumn.labelDate = first.date;
  return columns;
}

const CELL_GAP_PX = 3;
const TARGET_CELL_PX = 14;
/** Just over six months of whole weeks; the least a heat map ever shows. */
const MIN_WEEKS = 27;
/** The most whole weeks that always stay inside the endpoint's 366-day range. */
const MAX_WEEKS = 52;

/** How many week columns fit across `widthPx` at about the target cell size, between six months and a year. */
export function fitHeatMapWeeks(widthPx: number): number {
  const fitting = Math.floor((widthPx + CELL_GAP_PX) / (TARGET_CELL_PX + CELL_GAP_PX));
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, fitting));
}

/** The Monday that makes `weeks` columns end with the week holding `today`. */
export function heatMapStartForWeeks(weeks: number, today: DateOnlyIso): DateOnlyIso {
  return addDateOnlyDays(startOfDateOnlyWeek(today), -(weeks - 1) * 7);
}
