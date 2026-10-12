import type { DateOnlyIso } from '@pkg/schema';
import type { ReportWindow, ReportWindowInput, ReportWindowKind } from '@pkg/schema/contracting';
import {
  formatDate,
  JOHANNESBURG_TIME_ZONE,
  parseDateOnlyParts,
  zonedDateStartToUtcInstant,
} from '../formatting/date.js';
import { addDateOnlyDays, addDateOnlyMonths, diffDateOnlyDays } from '../formatting/date-only.js';

const isoMonthStart = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01` as DateOnlyIso;
const lastDayOf = (year: number, month: number) =>
  addDateOnlyDays(addDateOnlyMonths(isoMonthStart(year, month), 1), -1);
const monthsIn: Record<ReportWindowKind, number> = { month: 1, quarter: 3, year: 12 };

/** The first calendar month of the period. */
function firstMonthOf(input: ReportWindowInput): number {
  switch (input.kind) {
    case 'month':
      return input.period;
    case 'quarter':
      return (input.period - 1) * 3 + 1;
    case 'year':
      return 1;
  }
}

/** The period of `kind` that holds the calendar month. */
function windowInput(kind: ReportWindowKind, year: number, month: number): ReportWindowInput {
  switch (kind) {
    case 'month':
      return { kind, year, period: month };
    case 'quarter':
      return { kind, year, period: Math.floor((month - 1) / 3) + 1 };
    case 'year':
      return { kind, year };
  }
}

/** The period's calendar bounds, then the end capped at `today`; a window after today has zero days. */
export function resolveReportWindow(input: ReportWindowInput, today: DateOnlyIso): ReportWindow {
  const firstMonth = firstMonthOf(input);
  const start = isoMonthStart(input.year, firstMonth);
  const periodEnd = lastDayOf(input.year, firstMonth + monthsIn[input.kind] - 1);
  const end = periodEnd < today ? periodEnd : today;
  const days = end < start ? 0 : diffDateOnlyDays(end, start) + 1;
  return { ...input, start, end, days };
}

/** The window's plant-time instant range: its first day's midnight up to, not including, the midnight after its last day. */
export function reportWindowInstants(window: ReportWindow): { from: Date; to: Date } {
  return {
    from: zonedDateStartToUtcInstant(window.start, JOHANNESBURG_TIME_ZONE),
    to: zonedDateStartToUtcInstant(addDateOnlyDays(window.end, 1), JOHANNESBURG_TIME_ZONE),
  };
}

/** The twelve month windows ending in the month that holds `window.end`, oldest first. */
export function trailingMonthWindows(window: ReportWindow, today: DateOnlyIso): ReportWindow[] {
  const { month, year } = parseDateOnlyParts(window.end);
  const last = isoMonthStart(year, month);
  return Array.from({ length: 12 }, (_, index) => {
    const parts = parseDateOnlyParts(addDateOnlyMonths(last, index - 11));
    return resolveReportWindow({ kind: 'month', year: parts.year, period: parts.month }, today);
  });
}

export function currentReportWindow(kind: ReportWindowKind, today: DateOnlyIso): ReportWindowInput {
  const { month, year } = parseDateOnlyParts(today);
  return windowInput(kind, year, month);
}

/** The neighbouring period of the same kind. */
export function shiftReportWindow(input: ReportWindowInput, delta: 1 | -1): ReportWindowInput {
  const shifted = parseDateOnlyParts(
    addDateOnlyMonths(isoMonthStart(input.year, firstMonthOf(input)), delta * monthsIn[input.kind]),
  );
  return windowInput(input.kind, shifted.year, shifted.month);
}

/** The period of `kind` that holds the current window's first day. */
export function changeReportWindowKind(input: ReportWindowInput, kind: ReportWindowKind): ReportWindowInput {
  return windowInput(kind, input.year, firstMonthOf(input));
}

/** `October 2026`, `Q4 2026`, `2026`. */
export function reportWindowLabel(input: ReportWindowInput): string {
  switch (input.kind) {
    case 'month':
      return formatDate(isoMonthStart(input.year, input.period), 'month');
    case 'quarter':
      return `Q${input.period} ${input.year}`;
    case 'year':
      return String(input.year);
  }
}
