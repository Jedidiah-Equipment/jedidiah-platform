import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import { StatusQuickFilters } from './StatusQuickFilters.js';
import { pickWithoutStaleRange, STAGE_COLUMN_ID } from './stage-filter.js';

/** An Invoicing page's stage chips. Picking only open stages drops the invoiced date range, which would empty the list. */
export function InvoicingStageQuickFilters<Stage extends string>({
  onColumnFiltersChange,
  ...props
}: {
  stages: readonly Stage[];
  shown: readonly Stage[];
  labels: Record<Stage, string>;
  colours: Record<Stage, { dot: string }>;
  counts: Partial<Record<Stage, number>> | undefined;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void;
}) {
  return (
    <StatusQuickFilters
      {...props}
      label="Invoicing stages"
      columnId={STAGE_COLUMN_ID}
      statuses={props.stages}
      onColumnFiltersChange={(updater) => onColumnFiltersChange((current) => pickWithoutStaleRange(current, updater))}
    />
  );
}
