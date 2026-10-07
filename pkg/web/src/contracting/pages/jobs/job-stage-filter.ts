import { isJobQueue, openJobQueues } from '@pkg/domain/contracting';
import { type JobQueue, type JobQueueCounts, jobQueues } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { isPickedExactly, readMultiSelectFilter, togglePick } from '@/components/data-table/column-filter-values.js';

export const STAGE_COLUMN_ID = 'stage';

/** The stages picked in the Stage column filter, in queue order. */
export function pickedStages(columnFilters: ColumnFiltersState): JobQueue[] {
  const picked = readMultiSelectFilter(columnFilters, STAGE_COLUMN_ID).filter(isJobQueue);
  return jobQueues.filter((queue) => picked.includes(queue));
}

/** What the Jobs list asks the server for: the picked stages, or every open stage when none is picked. */
export function listedStages(columnFilters: ColumnFiltersState): JobQueue[] {
  const picked = pickedStages(columnFilters);
  return picked.length ? picked : [...openJobQueues];
}

/** Exactly these stages are picked. */
export const isPickedStages = (columnFilters: ColumnFiltersState, stages: readonly JobQueue[]) =>
  isPickedExactly(columnFilters, STAGE_COLUMN_ID, stages);

/**
 * The quick filters among `stages`: each one holding a Job, and one picked on its own even once it empties, so
 * pressing it again can clear it.
 */
export const quickFilterStages = (
  counts: JobQueueCounts | undefined,
  columnFilters: ColumnFiltersState,
  stages: readonly JobQueue[],
) => stages.filter((queue) => (counts?.[queue] ?? 0) > 0 || isPickedStages(columnFilters, [queue]));

/** Picks exactly these stages; pressing again clears the pick. */
export const toggleStages = (columnFilters: ColumnFiltersState, stages: readonly JobQueue[]) =>
  togglePick(columnFilters, STAGE_COLUMN_ID, stages);
