import {
  invoicingQuoteStages,
  openInvoicingQuoteStages,
  type QuoteListInput,
  QuoteOfferingType,
  type QuoteStageCounts,
} from '@pkg/schema/equipment';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { invoicedRange, listedInvoicingStages } from '@/components/data-table/stage-filter.js';

export const JOB_COMPLETED_COLUMN_ID = 'jobCompletedOn';
export const TYPE_COLUMN_ID = 'offeringType';

export type InvoicingQuoteStage = (typeof invoicingQuoteStages)[number];

export function invoicingListFilters(
  columnFilters: ColumnFiltersState,
  counts: QuoteStageCounts['counts'] | undefined,
): Pick<QuoteListInput, 'filters'> {
  const type = columnFilters.find((filter) => filter.id === TYPE_COLUMN_ID)?.value;
  const offeringType = QuoteOfferingType.safeParse(type).data;
  return {
    filters: {
      stages: listedInvoicingStages(columnFilters, {
        stages: invoicingQuoteStages,
        open: openInvoicingQuoteStages,
        counts,
      }),
      ...(offeringType ? { offeringType } : {}),
      ...invoicedRange(columnFilters),
    },
  };
}
