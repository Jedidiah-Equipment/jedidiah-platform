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

/** What the Jobs list asks the server for: the picked stages, or `unpicked` (every open stage) when none is picked. */
export function listedStages(
  columnFilters: ColumnFiltersState,
  unpicked: readonly JobQueue[] = openJobQueues,
): JobQueue[] {
  const picked = pickedStages(columnFilters);
  return picked.length ? picked : [...unpicked];
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

export const ATTENTION_COLUMN_ID = 'attention';
export const NEEDS_A_LOOK = 'needs-a-look';

const needsALookPicked = (columnFilters: ColumnFiltersState) =>
  columnFilters.some((filter) => filter.id === ATTENTION_COLUMN_ID && filter.value === NEEDS_A_LOOK);

export const jobListFilters = (columnFilters: ColumnFiltersState, unpicked?: readonly JobQueue[]) => ({
  queues: listedStages(columnFilters, unpicked),
  ...(needsALookPicked(columnFilters) ? { needsALook: true } : {}),
});

const withoutStageOrAttention = (columnFilters: ColumnFiltersState) =>
  columnFilters.filter((filter) => filter.id !== STAGE_COLUMN_ID && filter.id !== ATTENTION_COLUMN_ID);

/** The Dashboard opens a Job list on one stage this way; every other filter is kept. */
export const focusOnStage = (columnFilters: ColumnFiltersState, stage: JobQueue): ColumnFiltersState => [
  ...withoutStageOrAttention(columnFilters),
  { id: STAGE_COLUMN_ID, value: [stage] },
];

/** The Dashboard opens the Jobs list on the Jobs needing a look, across every open stage, this way. */
export const focusOnNeedsALook = (columnFilters: ColumnFiltersState): ColumnFiltersState => [
  ...withoutStageOrAttention(columnFilters),
  { id: ATTENTION_COLUMN_ID, value: NEEDS_A_LOOK },
];
