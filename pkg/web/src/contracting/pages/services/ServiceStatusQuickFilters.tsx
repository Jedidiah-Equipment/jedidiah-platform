import { serviceRecordStatusColorClassNames, serviceRecordStatusLabels } from '@pkg/domain/contracting';
import { type ServiceRecordStatus, type ServiceRecordSummary, serviceRecordStatuses } from '@pkg/schema/contracting';
import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import { QuickFilterButton } from '@/contracting/components/QuickFilterButton.js';
import { cn } from '@/lib/utils.js';
import { clearServiceStatuses, isPickedServiceStatuses, toggleServiceStatuses } from './types.js';

/**
 * The quick filters above the Services table: Booked in, Closed, then All. They narrow the Service Records only; the
 * Machines Due for Service stay pinned whatever is picked.
 */
export function ServiceStatusQuickFilters({
  summary,
  columnFilters,
  onColumnFiltersChange,
}: {
  summary: ServiceRecordSummary | undefined;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void;
}) {
  const toggle = (picked: readonly ServiceRecordStatus[]) =>
    onColumnFiltersChange((current) => toggleServiceStatuses(current, picked));
  return (
    <fieldset className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Service Record statuses">
      {serviceRecordStatuses.map((status) => (
        <QuickFilterButton
          key={status}
          count={summary?.counts[status] ?? 0}
          pressed={isPickedServiceStatuses(columnFilters, [status])}
          onClick={() => toggle([status])}
        >
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', serviceRecordStatusColorClassNames[status].dot)}
          />
          <span>{serviceRecordStatusLabels[status]}</span>
        </QuickFilterButton>
      ))}
      <QuickFilterButton
        count={summary ? summary.counts.open + summary.counts.closed : 0}
        pressed={isPickedServiceStatuses(columnFilters, [])}
        onClick={() => onColumnFiltersChange(clearServiceStatuses)}
      >
        <span>All</span>
      </QuickFilterButton>
    </fieldset>
  );
}
