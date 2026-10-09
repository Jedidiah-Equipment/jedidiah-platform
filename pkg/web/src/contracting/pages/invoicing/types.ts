import type { JobListInput, JobQueue, JobQueueCounts } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { readDateOnlyRangeFilter } from '@/components/data-table/column-filter-values.js';
import { pickedStages } from '../jobs/job-stage-filter.js';

export const INVOICED_COLUMN_ID = 'invoicedAt' as const;

/** The stages Invoicing lists: work waiting for an invoice number, and what has been invoiced. */
export const invoicingStages = ['awaiting-invoice', 'invoiced'] as const satisfies readonly JobQueue[];

/**
 * The Invoicing stages picked in the Stage filter. With none picked: the invoiced Jobs for a date range, since only
 * they have an invoice date; otherwise Awaiting invoice, or both stages once nothing is waiting.
 */
export function listedInvoicingStages(columnFilters: ColumnFiltersState, counts: JobQueueCounts): JobQueue[] {
  const picked = pickedStages(columnFilters).filter((queue) =>
    (invoicingStages as readonly JobQueue[]).includes(queue),
  );
  if (picked.length) return picked;
  const { invoicedFrom, invoicedTo } = invoicedRange(columnFilters);
  if (invoicedFrom || invoicedTo) return ['invoiced'];
  return counts['awaiting-invoice'] === 0 ? [...invoicingStages] : ['awaiting-invoice'];
}

/** The Invoiced column's date-range filter, as the South African calendar days the list narrows to. */
export const invoicedRange = (columnFilters: ColumnFiltersState): Pick<JobListInput, 'invoicedFrom' | 'invoicedTo'> =>
  readDateOnlyRangeFilter(columnFilters, INVOICED_COLUMN_ID, ['invoicedFrom', 'invoicedTo']);
