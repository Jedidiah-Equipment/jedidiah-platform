import { isJobQueue, type JobReadMode, openJobQueues, readableJobQueues } from '@pkg/domain/contracting';
import { type JobQueue, type JobQueueCounts, jobQueues } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { isPickedExactly, readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';
import { STAGE_COLUMN_ID } from '@/components/data-table/stage-filter.js';

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

/** The Jobs page's quick-filter stages: every stage the reader lists but Cancelled, so Invoiced follows the open ones. */
export const jobsQuickFilterStages = (mode: JobReadMode | null): readonly JobQueue[] =>
  mode ? readableJobQueues(mode).filter((queue) => queue !== 'cancelled') : openJobQueues;

export const ATTENTION_COLUMN_ID = 'attention';
export const NEEDS_A_LOOK = 'needs-a-look';

const needsALookPicked = (columnFilters: ColumnFiltersState) =>
  columnFilters.some((filter) => filter.id === ATTENTION_COLUMN_ID && filter.value === NEEDS_A_LOOK);

/** The Drivers column: it shows who is on site, and filters to the Jobs a Driver went on in any state. */
export const DRIVER_COLUMN_ID = 'driver';

/** The Driver picked in the Drivers column filter, or `''` when none is. */
export function pickedDriver(columnFilters: ColumnFiltersState): string {
  const value = columnFilters.find((filter) => filter.id === DRIVER_COLUMN_ID)?.value;
  return typeof value === 'string' ? value : '';
}

export const jobListFilters = (columnFilters: ColumnFiltersState, unpicked?: readonly JobQueue[]) => {
  const driverUserId = pickedDriver(columnFilters);
  return {
    queues: listedStages(columnFilters, unpicked),
    ...(needsALookPicked(columnFilters) ? { needsALook: true } : {}),
    ...(driverUserId ? { driverUserId } : {}),
  };
};

// The Dashboard counts every Driver's Jobs, so a hand-off clears the Driver pick too.
const handOffDrops = new Set([STAGE_COLUMN_ID, ATTENTION_COLUMN_ID, DRIVER_COLUMN_ID]);
const withoutHandOffFilters = (columnFilters: ColumnFiltersState) =>
  columnFilters.filter((filter) => !handOffDrops.has(filter.id));

/** The Dashboard opens a Job list on one stage this way; every filter but the Driver is kept. */
export const focusOnStage = (columnFilters: ColumnFiltersState, stage: JobQueue): ColumnFiltersState => [
  ...withoutHandOffFilters(columnFilters),
  { id: STAGE_COLUMN_ID, value: [stage] },
];

/** The Dashboard opens the Jobs list on the Jobs needing a look, across every open stage, this way. */
export const focusOnNeedsALook = (columnFilters: ColumnFiltersState): ColumnFiltersState => [
  ...withoutHandOffFilters(columnFilters),
  { id: ATTENTION_COLUMN_ID, value: NEEDS_A_LOOK },
];
