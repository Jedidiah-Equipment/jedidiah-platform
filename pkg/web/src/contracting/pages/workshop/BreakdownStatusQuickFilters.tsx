import { breakdownStatusColorClassNames, breakdownStatusesCount, breakdownStatusLabels } from '@pkg/domain/contracting';
import { type BreakdownQueueSummary, type BreakdownStatus, breakdownStatuses } from '@pkg/schema/contracting';
import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import { QuickFilterButton } from '@/contracting/components/QuickFilterButton.js';
import { cn } from '@/lib/utils.js';
import { isPickedStatuses, quickFilterStatuses, toggleStatuses } from './types.js';

/**
 * The quick filters above the Workshop: one per unsolved status that holds a Breakdown, then All, Solved included. Each presses only while
 * exactly its statuses are picked, and pressing it again goes back to every unsolved one.
 */
export function BreakdownStatusQuickFilters({
  summary,
  columnFilters,
  onColumnFiltersChange,
}: {
  summary: BreakdownQueueSummary | undefined;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void;
}) {
  const toggle = (picked: readonly BreakdownStatus[]) =>
    onColumnFiltersChange((current) => toggleStatuses(current, picked));
  return (
    <fieldset className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Breakdown statuses">
      {quickFilterStatuses(summary?.counts, columnFilters).map((status) => (
        <QuickFilterButton
          key={status}
          count={summary?.counts[status] ?? 0}
          pressed={isPickedStatuses(columnFilters, [status])}
          onClick={() => toggle([status])}
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', breakdownStatusColorClassNames[status].dot)} />
          <span>{breakdownStatusLabels[status]}</span>
        </QuickFilterButton>
      ))}
      <QuickFilterButton
        count={breakdownStatusesCount(summary?.counts)}
        pressed={isPickedStatuses(columnFilters, breakdownStatuses)}
        onClick={() => toggle(breakdownStatuses)}
      >
        <span>All</span>
      </QuickFilterButton>
    </fieldset>
  );
}
