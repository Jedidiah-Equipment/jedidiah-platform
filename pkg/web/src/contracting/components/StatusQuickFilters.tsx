import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import { isPickedExactly, togglePick } from '@/components/data-table/column-filter-values.js';
import { QuickFilterButton } from '@/contracting/components/QuickFilterButton.js';
import { cn } from '@/lib/utils.js';

/**
 * The quick filters over one status column: a chip per status in `shown`, then All. A chip presses only while exactly
 * its statuses are picked, and pressing it again clears the pick. All picks every status.
 */
export function StatusQuickFilters<TStatus extends string>({
  label,
  columnId,
  statuses,
  shown,
  labels,
  colours,
  counts,
  columnFilters,
  onColumnFiltersChange,
}: {
  label: string;
  columnId: string;
  /** Every status, which All counts. */
  statuses: readonly TStatus[];
  shown: readonly TStatus[];
  labels: Record<TStatus, string>;
  colours: Record<TStatus, { dot: string }>;
  counts: Partial<Record<TStatus, number>> | undefined;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void;
}) {
  const pick = (picked: readonly TStatus[]) =>
    onColumnFiltersChange((current) => togglePick(current, columnId, picked));
  return (
    <fieldset className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label={label}>
      {shown.map((status) => (
        <QuickFilterButton
          key={status}
          count={counts?.[status] ?? 0}
          pressed={isPickedExactly(columnFilters, columnId, [status])}
          onClick={() => pick([status])}
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', colours[status].dot)} />
          <span>{labels[status]}</span>
        </QuickFilterButton>
      ))}
      <QuickFilterButton
        count={statuses.reduce((total, status) => total + (counts?.[status] ?? 0), 0)}
        pressed={isPickedExactly(columnFilters, columnId, statuses)}
        onClick={() => pick(statuses)}
      >
        <span>All</span>
      </QuickFilterButton>
    </fieldset>
  );
}
