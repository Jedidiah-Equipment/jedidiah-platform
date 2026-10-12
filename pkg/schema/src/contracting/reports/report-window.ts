import { z } from 'zod';
import { DateOnlyIso } from '../../common/date.js';

export const reportWindowKinds = ['month', 'quarter', 'year'] as const;
export const ReportWindowKind = z.enum(reportWindowKinds);
export type ReportWindowKind = z.infer<typeof ReportWindowKind>;

/** One calendar period: `period` is the month 1–12, the quarter 1–4, or absent for a year. */
export const ReportWindowInput = z
  .object({ kind: ReportWindowKind, year: z.int().min(2020).max(2100), period: z.int().min(1).max(12).optional() })
  .strict()
  .superRefine((value, ctx) => {
    const max = value.kind === 'month' ? 12 : value.kind === 'quarter' ? 4 : 0;
    if (max === 0 && value.period !== undefined)
      ctx.addIssue({ code: 'custom', path: ['period'], message: 'A year window has no period' });
    if (max > 0 && (value.period === undefined || value.period > max))
      ctx.addIssue({ code: 'custom', path: ['period'], message: `Choose a period from 1 to ${max}` });
  });
export type ReportWindowInput = z.infer<typeof ReportWindowInput>;

/** The window as served: inclusive plant-date bounds after the today cap, and its day count. */
export const ReportWindow = z.object({
  kind: ReportWindowKind,
  year: z.int(),
  period: z.int().nullable(),
  start: DateOnlyIso,
  end: DateOnlyIso,
  days: z.int().nonnegative(),
});
export type ReportWindow = z.infer<typeof ReportWindow>;
