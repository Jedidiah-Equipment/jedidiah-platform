import { breakdownStatusColorClassNames, breakdownStatusLabels } from '@pkg/domain/contracting';
import { type BreakdownQueueSummary, type BreakdownStatus, breakdownStatuses } from '@pkg/schema/contracting';
import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import { isPickedExactly, togglePick } from '@/components/data-table/column-filter-values.js';
import { QuickFilterButton } from '@/contracting/components/QuickFilterButton.js';
import { cn } from '@/lib/utils.js';
import { STATUS_COLUMN_ID } from './types.js';

const counted: Partial<Record<BreakdownStatus, keyof BreakdownQueueSummary>> = {
  open: 'open',
  'in-progress': 'inProgress',
};

/** One chip per status: pressing picks exactly that status, pressing again goes back to every unsolved one. */
export function BreakdownStatusQuickFilters({
  summary,
  columnFilters,
  onColumnFiltersChange,
}: {
  summary: BreakdownQueueSummary | undefined;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void;
}) {
  const toggle = (status: BreakdownStatus) =>
    onColumnFiltersChange((current) => togglePick(current, STATUS_COLUMN_ID, [status]));
  return (
    <fieldset className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Breakdown statuses">
      {breakdownStatuses.map((status) => {
        const countKey = counted[status];
        return (
          <QuickFilterButton
            key={status}
            count={countKey && summary ? summary[countKey] : undefined}
            pressed={isPickedExactly(columnFilters, STATUS_COLUMN_ID, [status])}
            onClick={() => toggle(status)}
          >
            <span
              aria-hidden="true"
              className={cn('size-2 rounded-full border', breakdownStatusColorClassNames[status].chip)}
            />
            <span>{breakdownStatusLabels[status]}</span>
          </QuickFilterButton>
        );
      })}
    </fieldset>
  );
}
