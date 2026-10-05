import { DateOnlyIso } from '@pkg/schema';
import type { JobListInput, JobQueue, JobQueueCounts } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { isOnlyStage, pickedStages } from '../jobs/job-stage-filter.js';

export const INVOICED_COLUMN_ID = 'invoicedAt' as const;

/** The stages Invoicing lists: work waiting for an invoice number, and what has been invoiced. */
export const invoicingStages = ['awaiting-invoice', 'invoiced'] as const satisfies readonly JobQueue[];

/** Awaiting invoice by default, or both stages once nothing is waiting. */
export const defaultInvoicingStages = (counts: JobQueueCounts | undefined): JobQueue[] =>
  counts && counts['awaiting-invoice'] === 0 ? [...invoicingStages] : ['awaiting-invoice'];

/** The Invoicing stages picked in the Stage filter, or the default when none is picked. */
export function listedInvoicingStages(columnFilters: ColumnFiltersState, counts: JobQueueCounts | undefined) {
  const picked = pickedStages(columnFilters).filter((queue) =>
    (invoicingStages as readonly JobQueue[]).includes(queue),
  );
  if (picked.length) return picked;
  // Only an invoiced Job has an invoice date, so a date range alone lists the invoiced ones.
  const { invoicedFrom, invoicedTo } = invoicedRange(columnFilters);
  return invoicedFrom || invoicedTo ? ['invoiced' as const] : defaultInvoicingStages(counts);
}

/** Awaiting invoice keeps its quick filter while it holds a Job, or while it is the stage picked on its own. */
export const showsAwaitingQuickFilter = (columnFilters: ColumnFiltersState, counts: JobQueueCounts | undefined) =>
  (counts?.['awaiting-invoice'] ?? 0) > 0 || isOnlyStage(columnFilters, 'awaiting-invoice');

/** The Invoiced column's date-range filter, as the South African calendar days the list narrows to. */
export function invoicedRange(columnFilters: ColumnFiltersState): Pick<JobListInput, 'invoicedFrom' | 'invoicedTo'> {
  const value = columnFilters.find((filter) => filter.id === INVOICED_COLUMN_ID)?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const { start, end } = value as { start?: unknown; end?: unknown };
  const invoicedFrom = DateOnlyIso.safeParse(start).data;
  const invoicedTo = DateOnlyIso.safeParse(end).data;
  return { ...(invoicedFrom ? { invoicedFrom } : {}), ...(invoicedTo ? { invoicedTo } : {}) };
}
