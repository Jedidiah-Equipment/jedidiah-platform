import { z } from 'zod';
import { DateOnlyIso } from '../../common/date.js';

export const reportWindowKinds = ['month', 'quarter', 'year'] as const;
export const ReportWindowKind = z.enum(reportWindowKinds);
export type ReportWindowKind = z.infer<typeof ReportWindowKind>;

/** The first report year; a window before it is refused. */
const ReportYear = z.int().min(2020).max(2100);

const MonthWindow = z.object({ kind: z.literal('month'), year: ReportYear, period: z.int().min(1).max(12) });
const QuarterWindow = z.object({ kind: z.literal('quarter'), year: ReportYear, period: z.int().min(1).max(4) });
const YearWindow = z.object({ kind: z.literal('year'), year: ReportYear });

/** One calendar period: `period` is the month 1–12 or the quarter 1–4; a year has none. */
export const ReportWindowInput = z.discriminatedUnion('kind', [
  MonthWindow.strict(),
  QuarterWindow.strict(),
  YearWindow.strict(),
]);
export type ReportWindowInput = z.infer<typeof ReportWindowInput>;

/** Inclusive plant-date bounds after the today cap, and the day count. */
const ResolvedBounds = { start: DateOnlyIso, end: DateOnlyIso, days: z.int().nonnegative() };

/** The window as served: the period it was asked for, with its resolved bounds. */
export const ReportWindow = z.discriminatedUnion('kind', [
  MonthWindow.extend(ResolvedBounds),
  QuarterWindow.extend(ResolvedBounds),
  YearWindow.extend(ResolvedBounds),
]);
export type ReportWindow = z.infer<typeof ReportWindow>;
