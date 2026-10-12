import type { DateOnlyIso } from '@pkg/schema';
import { type ReportWindow, ReportWindowInput, type ReportWindowKind } from '@pkg/schema/contracting';
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
  if (input.kind === 'year') return 1;
  const period = input.period ?? 1;
  return input.kind === 'month' ? period : (period - 1) * 3 + 1;
}

const periodOf = (kind: ReportWindowKind, month: number): number | undefined =>
  kind === 'month' ? month : kind === 'quarter' ? Math.floor((month - 1) / 3) + 1 : undefined;

const windowInput = (kind: ReportWindowKind, year: number, month: number): ReportWindowInput => {
  const period = periodOf(kind, month);
  return period === undefined ? { kind, year } : { kind, year, period };
};

/** The period's calendar bounds, then the end capped at `today`; a window after today has zero days. */
export function resolveReportWindow(input: ReportWindowInput, today: DateOnlyIso): ReportWindow {
  const { kind, year } = input;
  const firstMonth = firstMonthOf(input);
  const start = isoMonthStart(year, firstMonth);
  const periodEnd = lastDayOf(year, firstMonth + monthsIn[kind] - 1);
  const end = periodEnd < today ? periodEnd : today;
  const days = end < start ? 0 : diffDateOnlyDays(end, start) + 1;
  return { kind, year, period: input.period ?? null, start, end, days };
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

/** `2026-10` / `2026-Q4` / `2026`: the URL and label form of a window. */
export function formatReportWindowParam(input: ReportWindowInput): string {
  if (input.kind === 'month') return `${input.year}-${String(input.period).padStart(2, '0')}`;
  if (input.kind === 'quarter') return `${input.year}-Q${input.period}`;
  return String(input.year);
}

export function currentReportWindow(kind: ReportWindowKind, today: DateOnlyIso): ReportWindowInput {
  const { month, year } = parseDateOnlyParts(today);
  return windowInput(kind, year, month);
}

/** Reads a window from the URL; anything the window schema refuses opens the current month. */
export function parseReportWindowParam(value: string | undefined, today: DateOnlyIso): ReportWindowInput {
  const groups = /^(?<year>\d{4})(?:-(?:(?<month>\d{2})|Q(?<quarter>\d)))?$/.exec(value ?? '')?.groups;
  if (!groups) return currentReportWindow('month', today);
  const year = Number(groups.year);
  const candidate =
    groups.month !== undefined
      ? { kind: 'month', year, period: Number(groups.month) }
      : groups.quarter !== undefined
        ? { kind: 'quarter', year, period: Number(groups.quarter) }
        : { kind: 'year', year };
  const parsed = ReportWindowInput.safeParse(candidate);
  return parsed.success ? parsed.data : currentReportWindow('month', today);
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
  if (input.kind === 'month') return formatDate(isoMonthStart(input.year, firstMonthOf(input)), 'month');
  if (input.kind === 'quarter') return `Q${input.period} ${input.year}`;
  return String(input.year);
}
