import { formatNumber } from '@pkg/domain';
import { breakdownStatusColorClassNames, breakdownStatusLabels } from '@pkg/domain/contracting';
import { type BreakdownQueueSummary, type BreakdownStatus, breakdownStatuses } from '@pkg/schema/contracting';
import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import { readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';
import { Button } from '@/components/ui/button.js';
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
  const picked = readMultiSelectFilter(columnFilters, STATUS_COLUMN_ID);
  const isPicked = (status: BreakdownStatus) => picked.length === 1 && picked[0] === status;
  const toggle = (status: BreakdownStatus) =>
    onColumnFiltersChange((current) => {
      const others = current.filter((filter) => filter.id !== STATUS_COLUMN_ID);
      return isPicked(status) ? others : [...others, { id: STATUS_COLUMN_ID, value: [status] }];
    });
  return (
    <fieldset className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Breakdown statuses">
      {breakdownStatuses.map((status) => {
        const countKey = counted[status];
        return (
          <Button
            key={status}
            aria-pressed={isPicked(status)}
            className={cn(
              'h-9 gap-1.5 px-2',
              isPicked(status) && 'border-muted-foreground/60 bg-muted text-foreground',
            )}
            onClick={() => toggle(status)}
            size="sm"
            type="button"
            variant="outline"
          >
            <span
              aria-hidden="true"
              className={cn('size-2 rounded-full border', breakdownStatusColorClassNames[status].chip)}
            />
            <span>{breakdownStatusLabels[status]}</span>
            {countKey && summary ? (
              <span className="rounded bg-muted px-1 text-xs text-muted-foreground">
                {formatNumber(summary[countKey])}
              </span>
            ) : null}
          </Button>
        );
      })}
    </fieldset>
  );
}
