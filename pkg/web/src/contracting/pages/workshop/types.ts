import { actionSheet } from '@pkg/domain/contracting';
import type { BreakdownDetail, BreakdownPatchInput, BreakdownStatus, BreakdownUrgency } from '@pkg/schema/contracting';
import { breakdownStatuses, unsolvedBreakdownStatuses } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';

/** The Breakdown page's reading of the Breakdown Actions the server served, as `jobSheet` reads Job Actions. */
export const breakdownSheet = (breakdown: Pick<BreakdownDetail, 'actions'>) => actionSheet(breakdown.actions);

export type BreakdownSheet = ReturnType<typeof breakdownSheet>;

export const STATUS_COLUMN_ID = 'status';

/** What the queue asks the server for: the picked statuses, or every unsolved one when none is picked. */
export function listedStatuses(columnFilters: ColumnFiltersState): BreakdownStatus[] {
  const picked = readMultiSelectFilter(columnFilters, STATUS_COLUMN_ID);
  const statuses = breakdownStatuses.filter((status) => picked.includes(status));
  return statuses.length ? statuses : [...unsolvedBreakdownStatuses];
}

export type ReportValues = { description: string; urgency: BreakdownUrgency; jobId: string };

/**
 * The report fields that differ from what was last saved, so a save never rewrites a field someone else may have
 * changed since this page loaded; `patchBreakdown` keeps every omitted field.
 */
export function reportPatchInput(id: string, saved: ReportValues, values: ReportValues): BreakdownPatchInput {
  return {
    id,
    ...(values.description === saved.description ? {} : { description: values.description }),
    ...(values.urgency === saved.urgency ? {} : { urgency: values.urgency }),
    ...(values.jobId === saved.jobId ? {} : { jobId: values.jobId || null }),
  };
}
