import { type ColumnFiltersState, functionalUpdate, type Updater } from '@tanstack/react-table';
import { readDateOnlyRangeFilter, readMultiSelectFilter } from './column-filter-values.js';

/** The Stage column both businesses' lists filter by, and the Invoiced column whose date range narrows them. */
export const STAGE_COLUMN_ID = 'stage';
export const INVOICED_COLUMN_ID = 'invoicedAt';

/** The Invoiced column's date-range filter, as the plant calendar days the list narrows to. */
export const invoicedRange = (columnFilters: ColumnFiltersState) =>
  readDateOnlyRangeFilter(columnFilters, INVOICED_COLUMN_ID, ['invoicedFrom', 'invoicedTo']);

/**
 * The stages an Invoicing page lists, in `stages` order: the picked ones; with none picked, Invoiced for an invoiced
 * date range, since only those carry an invoice date; otherwise the `open` stages, or every stage once none is open.
 */
export function listedInvoicingStages<Stage extends string>(
  columnFilters: ColumnFiltersState,
  {
    stages,
    open,
    counts,
  }: {
    stages: readonly Stage[];
    open: readonly Stage[];
    counts: Readonly<Record<NoInfer<Stage>, number>> | undefined;
  },
): Stage[] {
  const picked = readMultiSelectFilter(columnFilters, STAGE_COLUMN_ID);
  const listed = stages.filter((stage) => picked.includes(stage));
  if (listed.length) return listed;
  const { invoicedFrom, invoicedTo } = invoicedRange(columnFilters);
  if (invoicedFrom || invoicedTo) return stages.filter((stage) => stage === 'invoiced');
  return !counts || open.some((stage) => counts[stage] > 0) ? [...open] : [...stages];
}

/** The Dashboard opens Invoicing on one stage this way; the invoiced range goes too, or it would hide the open work. */
export const focusOnInvoicingStage = (columnFilters: ColumnFiltersState, stage: string): ColumnFiltersState => [
  ...columnFilters.filter((filter) => filter.id !== STAGE_COLUMN_ID && filter.id !== INVOICED_COLUMN_ID),
  { id: STAGE_COLUMN_ID, value: [stage] },
];

/** A quick filter's pick; an open stage carries no invoice date, so picking only open stages drops the invoiced range. */
export function pickWithoutStaleRange(
  current: ColumnFiltersState,
  updater: Updater<ColumnFiltersState>,
): ColumnFiltersState {
  const next = functionalUpdate(updater, current);
  const picked = readMultiSelectFilter(next, STAGE_COLUMN_ID);
  return picked.length && !picked.includes('invoiced')
    ? next.filter((filter) => filter.id !== INVOICED_COLUMN_ID)
    : next;
}
