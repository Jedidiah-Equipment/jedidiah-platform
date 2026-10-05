import { openJobQueues } from '@pkg/domain/contracting';
import { type JobQueue, type JobQueueCounts, jobQueues } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';

export const STAGE_COLUMN_ID = 'stage';

const isJobQueue = (value: unknown): value is JobQueue => jobQueues.includes(value as JobQueue);

/** The stages picked in the Stage column filter, in queue order. */
export function pickedStages(columnFilters: ColumnFiltersState): JobQueue[] {
  const value = columnFilters.find((filter) => filter.id === STAGE_COLUMN_ID)?.value;
  const picked = Array.isArray(value) ? value.filter(isJobQueue) : [];
  return jobQueues.filter((queue) => picked.includes(queue));
}

/** What the list asks the server for: the picked stages, or the page's default stages when none is picked. */
export function listedStages(
  columnFilters: ColumnFiltersState,
  defaults: readonly JobQueue[] = openJobQueues,
): JobQueue[] {
  const picked = pickedStages(columnFilters);
  return picked.length ? picked : [...defaults];
}

/**
 * Quick filters cover the open stages that hold a Job; Invoiced and Cancelled stay in the column filter. A stage
 * picked on its own keeps its quick filter even once it empties, so pressing it again can clear it.
 */
export const quickFilterStages = (counts: JobQueueCounts | undefined, columnFilters: ColumnFiltersState = []) =>
  openJobQueues.filter((queue) => (counts?.[queue] ?? 0) > 0 || isOnlyStage(columnFilters, queue));

export const isOnlyStage = (columnFilters: ColumnFiltersState, queue: JobQueue) => {
  const picked = pickedStages(columnFilters);
  return picked.length === 1 && picked[0] === queue;
};

/** A quick filter shows just its stage; pressing it again goes back to the page's default stages. */
export function toggleQuickFilter(columnFilters: ColumnFiltersState, queue: JobQueue): ColumnFiltersState {
  return toggleStages(columnFilters, [queue]);
}

const sameStages = (left: readonly JobQueue[], right: readonly JobQueue[]) =>
  left.length === right.length && left.every((queue) => right.includes(queue));

/** Exactly these stages are picked: the All quick filter on a page whose All covers `stages`. */
export const isPickedStages = (columnFilters: ColumnFiltersState, stages: readonly JobQueue[]) =>
  sameStages(pickedStages(columnFilters), stages);

/** Picks exactly these stages; pressing again goes back to the page's default stages. */
export function toggleStages(columnFilters: ColumnFiltersState, stages: readonly JobQueue[]): ColumnFiltersState {
  const others = columnFilters.filter((filter) => filter.id !== STAGE_COLUMN_ID);
  return isPickedStages(columnFilters, stages) ? others : [...others, { id: STAGE_COLUMN_ID, value: [...stages] }];
}

/** How many Jobs this person reads across these stages. */
export const stagesCount = (counts: JobQueueCounts | undefined, stages: readonly JobQueue[] = jobQueues) =>
  stages.reduce((total, queue) => total + (counts?.[queue] ?? 0), 0);
