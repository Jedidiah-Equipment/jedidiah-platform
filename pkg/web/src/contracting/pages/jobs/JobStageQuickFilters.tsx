import {
  assignmentAttentionLevelColorClassNames,
  jobQueueColorClassNames,
  jobQueueLabels,
  stagesCount,
} from '@pkg/domain/contracting';
import type { JobQueue, JobQueueSummary } from '@pkg/schema/contracting';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import { QuickFilterButton } from '@/contracting/components/QuickFilterButton.js';
import { cn } from '@/lib/utils.js';
import { isPickedStages, quickFilterStages, toggleStages } from './job-stage-filter.js';

/**
 * The quick filters above a Job list: one per stage among `stages` that holds a Job, then All for `allStages`. Each
 * presses only while exactly its stages are picked, and pressing it again clears the pick.
 */
export function JobStageQuickFilters({
  label,
  stages,
  allStages,
  summary,
  columnFilters,
  onColumnFiltersChange,
}: {
  label: string;
  stages: readonly JobQueue[];
  allStages: readonly JobQueue[];
  summary: JobQueueSummary | undefined;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void;
}) {
  const toggle = (picked: readonly JobQueue[]) => onColumnFiltersChange((current) => toggleStages(current, picked));
  return (
    <fieldset className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label={label}>
      {quickFilterStages(summary?.counts, columnFilters, stages).map((queue) => {
        const attention = summary?.attention[queue];
        return (
          <QuickFilterButton
            key={queue}
            count={summary?.counts[queue] ?? 0}
            pressed={isPickedStages(columnFilters, [queue])}
            onClick={() => toggle([queue])}
            attention={
              attention ? (
                <IconAlertTriangle
                  aria-label="Jobs need a look"
                  className={cn('size-3.5', assignmentAttentionLevelColorClassNames[attention].icon)}
                />
              ) : null
            }
          >
            <span aria-hidden="true" className={cn('size-2 rounded-full', jobQueueColorClassNames[queue].dot)} />
            <span>{jobQueueLabels[queue]}</span>
          </QuickFilterButton>
        );
      })}
      <QuickFilterButton
        count={stagesCount(summary?.counts, allStages)}
        pressed={isPickedStages(columnFilters, allStages)}
        onClick={() => toggle(allStages)}
      >
        <span>All</span>
      </QuickFilterButton>
    </fieldset>
  );
}
