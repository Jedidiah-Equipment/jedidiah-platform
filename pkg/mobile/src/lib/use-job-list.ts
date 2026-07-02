import {
  deriveJobProgress,
  hasPermission,
  type JobProgress,
  type JobWorkSlotEntry,
  listEnabledBays,
} from '@pkg/domain';
import type { BayOperator, DateOnlyIso, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useTRPC } from './trpc';
import { useAccess } from './use-access';
import { useBayCalendars } from './use-bay-calendars';

/** One Job currently on the board, projected from its Work Slots across every Bay it touches. */
export type JobListCard = {
  jobId: string;
  jobCode: string;
  productName: string;
  productThumbnailDataUrl: string | null;
  customerCompanyName: string | null;
  /** Operator on the Job's current Bay (the one running today, or the next to start). */
  operator: BayOperator | null;
  progress: JobProgress;
};

export type JobListState =
  | { status: 'error'; error: unknown }
  | { status: 'forbidden' }
  | { status: 'pending' }
  | { status: 'ready'; cards: JobListCard[]; today: DateOnlyIso };

export type JobListResult = {
  state: JobListState;
  /** Refetch access + the Board, e.g. from pull-to-refresh. */
  refresh: () => void;
  isRefreshing: boolean;
};

/**
 * Loads the Job List from the same cached Board (`jobs.listBays`) the Bay List reads,
 * so toggling between them never refetches. Groups every Work Slot by its Job — across all the
 * Bays the Job passes through — and projects each Job's board state through the shared
 * {@link deriveJobProgress}, the single seam the Job Detail header reuses so the two never disagree.
 *
 * Jobs with no unfinished Work Slot project to `null` and drop off, mirroring the Bay List. Gating
 * matches {@link useBayList}: `jobs.listBays` requires `job:read`, surfaced as `forbidden` rather
 * than a 403 that reads as a connection error.
 */
export function useJobList(): JobListResult {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canReadJobs = hasPermission(accessQuery.data, 'job:read');
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(undefined, { enabled: canReadJobs }));
  const bayCalendars = useBayCalendars({ enabled: canReadJobs });

  const state = useMemo<JobListState>(() => {
    if (accessQuery.isPending) return { status: 'pending' };
    if (accessQuery.error && accessQuery.data === undefined) return { status: 'error', error: accessQuery.error };
    if (!canReadJobs) return { status: 'forbidden' };

    if (baysQuery.error) return { status: 'error', error: baysQuery.error };
    if (baysQuery.isPending || !bayCalendars) return { status: 'pending' };

    const { items, jobs, today } = baysQuery.data;
    // Disabled Bays are hidden everywhere on the shop floor (mirrors the Bay List's listEnabledBays);
    // grouping their Slots would leak Jobs on retired Bays back into the Jobs board.
    const bays = listEnabledBays(items);
    const jobsById = new Map(jobs.map((job) => [job.id, job] as const));
    const operatorByBayId = new Map<UUID, BayOperator | null>(bays.map((bay) => [bay.id, bay.currentOperator]));

    // Group every Work Slot by its Job, keeping each Slot's Bay name and calendar so the projection
    // sees the Job's full route across the Bays it passes through.
    const slotsByJobId = new Map<string, JobWorkSlotEntry[]>();
    for (const bay of bays) {
      const workingCalendar = bayCalendars.workingCalendarsByBayId.get(bay.id) ?? {};
      for (const slot of bay.slots) {
        if (slot.kind !== 'work') continue;
        const entries = slotsByJobId.get(slot.jobId) ?? [];
        entries.push({ slot, bayName: bay.name, workingCalendar });
        slotsByJobId.set(slot.jobId, entries);
      }
    }

    const cards: JobListCard[] = [];
    for (const [jobId, slots] of slotsByJobId) {
      const progress = deriveJobProgress({ slots, today });
      const job = jobsById.get(jobId);
      // Skip fully-past Jobs (no unfinished Slot) and any Job whose summary failed to resolve.
      if (!progress || !job) continue;

      cards.push({
        jobId,
        jobCode: job.code,
        productName: job.productName,
        productThumbnailDataUrl: job.productThumbnailDataUrl,
        customerCompanyName: job.customerCompanyName,
        operator: operatorByBayId.get(progress.currentBayId) ?? null,
        progress,
      });
    }

    return { status: 'ready', cards, today };
  }, [
    accessQuery.data,
    accessQuery.error,
    accessQuery.isPending,
    bayCalendars,
    baysQuery.data,
    baysQuery.error,
    baysQuery.isPending,
    canReadJobs,
  ]);

  const refresh = useCallback(() => {
    void accessQuery.refetch();
    if (canReadJobs) void baysQuery.refetch();
  }, [accessQuery, baysQuery, canReadJobs]);

  return {
    state,
    refresh,
    isRefreshing: accessQuery.isRefetching || baysQuery.isRefetching,
  };
}
