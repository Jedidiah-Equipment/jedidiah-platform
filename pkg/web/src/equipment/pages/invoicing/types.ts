import {
  invoicingQuoteStages,
  openInvoicingQuoteStages,
  type QuoteListInput,
  QuoteOfferingType,
  type QuoteStageCounts,
} from '@pkg/schema/equipment';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { readDateOnlyRangeFilter, readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';

export const STAGE_COLUMN_ID = 'stage';
export const INVOICED_COLUMN_ID = 'invoicedAt';
export const JOB_COMPLETED_COLUMN_ID = 'jobCompletedOn';
export const TYPE_COLUMN_ID = 'offeringType';

export type InvoicingQuoteStage = (typeof invoicingQuoteStages)[number];

/** The Invoiced column's date-range filter, as the plant calendar days the list narrows to. */
export const invoicedRange = (
  columnFilters: ColumnFiltersState,
): Pick<QuoteListInput['filters'], 'invoicedFrom' | 'invoicedTo'> =>
  readDateOnlyRangeFilter(columnFilters, INVOICED_COLUMN_ID, ['invoicedFrom', 'invoicedTo']);

/**
 * The stages Invoicing lists: the picked ones; with none picked, Invoiced for an invoiced date range, since only
 * those Quotes have an invoice date; otherwise the open stages, or all four once nothing is open.
 */
export function listedInvoicingStages(
  columnFilters: ColumnFiltersState,
  counts: QuoteStageCounts['counts'] | undefined,
): InvoicingQuoteStage[] {
  const picked = readMultiSelectFilter(columnFilters, STAGE_COLUMN_ID);
  const listed = invoicingQuoteStages.filter((stage) => picked.includes(stage));
  if (listed.length) return listed;
  const { invoicedFrom, invoicedTo } = invoicedRange(columnFilters);
  if (invoicedFrom || invoicedTo) return ['invoiced'];
  return !counts || openInvoicingQuoteStages.some((stage) => counts[stage] > 0)
    ? [...openInvoicingQuoteStages]
    : [...invoicingQuoteStages];
}

export function invoicingListFilters(
  columnFilters: ColumnFiltersState,
  counts: QuoteStageCounts['counts'] | undefined,
): Pick<QuoteListInput, 'filters'> {
  const type = columnFilters.find((filter) => filter.id === TYPE_COLUMN_ID)?.value;
  const offeringType = QuoteOfferingType.safeParse(type).data;
  return {
    filters: {
      stages: listedInvoicingStages(columnFilters, counts),
      ...(offeringType ? { offeringType } : {}),
      ...invoicedRange(columnFilters),
    },
  };
}

/**
 * The Dashboard opens Invoicing on one stage this way. The other column filters go, so the list matches the tile's
 * count, which spans every type and invoice date.
 */
export const focusOnInvoicingStage = (stage: InvoicingQuoteStage): ColumnFiltersState => [
  { id: STAGE_COLUMN_ID, value: [stage] },
];
