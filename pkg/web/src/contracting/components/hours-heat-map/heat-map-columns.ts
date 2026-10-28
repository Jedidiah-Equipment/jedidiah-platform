import { diffDateOnlyDays, parseDateOnlyParts, startOfDateOnlyWeek } from '@pkg/domain';
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
