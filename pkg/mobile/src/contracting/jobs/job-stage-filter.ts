import { formatNumber } from '@pkg/domain';
import { isJobQueue, jobQueueLabels, stagesCount } from '@pkg/domain/contracting';
import type { JobQueue, JobQueueCounts } from '@pkg/schema/contracting';
import type { ListControlOption } from '@/components/ListControls';

/** Every open stage, or one stage, as web's Stage filter offers them. */
export type StageFilter = 'open' | JobQueue;

export const isStageFilter = (value: unknown): value is StageFilter => value === 'open' || isJobQueue(value);

/** The saved stage while this person still reads it; one saved under a broader role falls back to the open stages. */
export const readableStage = (saved: StageFilter, readable: readonly JobQueue[]): StageFilter =>
  saved === 'open' || readable.includes(saved) ? saved : 'open';

/** The queues a stage lists. */
export const stageQueues = (stage: StageFilter, open: readonly JobQueue[]): JobQueue[] =>
  stage === 'open' ? [...open] : [stage];

/** The Stage filter's options with their counts: the open stages together, then each stage this person reads. */
export function stageOptions(
  readable: readonly JobQueue[],
  open: readonly JobQueue[],
  counts: JobQueueCounts | undefined,
): ListControlOption<StageFilter>[] {
  const count = (queues: readonly JobQueue[]) => (counts ? ` (${formatNumber(stagesCount(counts, queues))})` : '');
  return [
    { label: `Open stages${count(open)}`, value: 'open' },
    ...readable.map((queue) => ({ label: `${jobQueueLabels[queue]}${count([queue])}`, value: queue })),
  ];
}
