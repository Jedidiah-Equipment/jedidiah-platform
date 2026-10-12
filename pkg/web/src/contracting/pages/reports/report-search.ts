import { currentReportWindow } from '@pkg/domain/contracting';
import { type DateOnlyIso, UUID } from '@pkg/schema';
import { ReportWindowInput, type UtilisationTrendSubject } from '@pkg/schema/contracting';
import { z } from 'zod';

export const reportTabs = ['utilisation', 'mechanics'] as const;
export type ReportTab = (typeof reportTabs)[number];

/** The Reports page URL: a tab, a window such as `2026-10` / `2026-Q4` / `2026`, and the trend's subject. */
export const ReportsSearch = z.object({
  tab: z.enum(reportTabs).optional(),
  window: z.string().optional(),
  /** `category:<uuid>` | `machine:<uuid>`; absent is the fleet. */
  subject: z.string().optional(),
});
export type ReportsSearch = z.infer<typeof ReportsSearch>;

export function formatReportWindowParam(input: ReportWindowInput): string {
  switch (input.kind) {
    case 'month':
      return `${input.year}-${String(input.period).padStart(2, '0')}`;
    case 'quarter':
      return `${input.year}-Q${input.period}`;
    case 'year':
      return String(input.year);
  }
}

/** Anything the window schema refuses opens the current month. */
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

/** The fleet has no URL form. */
export function formatReportSubject(subject: UtilisationTrendSubject): string | undefined {
  return subject.kind === 'fleet' ? undefined : `${subject.kind}:${subject.id}`;
}

export function parseReportSubject(value: string | undefined): UtilisationTrendSubject {
  const [kind, id] = (value ?? '').split(':');
  const parsed = UUID.safeParse(id);
  if ((kind === 'category' || kind === 'machine') && parsed.success) return { kind, id: parsed.data };
  return { kind: 'fleet' };
}
