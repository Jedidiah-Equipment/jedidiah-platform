import {
  type ActiveJobProgress,
  bayWorkingCalendars,
  deriveActiveJobProgress,
  isWorkingDay,
  JOB_DEPARTMENT_PIPELINE,
} from '@pkg/domain';
import type { BayOperator, BaySchedule, DateOnlyIso, ProjectedWorkJobSlot } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useConnectivity } from './connectivity';
import { useTRPC } from './trpc';

/** A Bay card's active Job, joined from `jobs.list` and projected for days-left. */
export type BayListActiveJob = ActiveJobProgress & {
  jobCode: string;
  productName: string;
  productThumbnailDataUrl: string | null;
};

export type BayListCard = {
  id: string;
  name: string;
  operator: BayOperator | null;
  /** Null when no Work Slot covers today (idle/free/off) — the card shows an idle state. */
  active: BayListActiveJob | null;
};

export type BayListState =
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'offline'; retry: () => void }
  | { status: 'pending' }
  | { status: 'ready'; cards: BayListCard[]; isOffline: boolean; retry: () => void; today: DateOnlyIso };

const departmentOrder = new Map(JOB_DEPARTMENT_PIPELINE.map((step, index) => [step.department, index]));

// Same Bay ordering as web: department pipeline, then name within a department.
function byDepartmentPipeline(left: BaySchedule, right: BaySchedule): number {
  const order =
    (departmentOrder.get(left.department) ?? Number.MAX_SAFE_INTEGER) -
    (departmentOrder.get(right.department) ?? Number.MAX_SAFE_INTEGER);

  return order !== 0 ? order : left.name.localeCompare(right.name);
}

// Unpaged read so every active Job resolves to a product name in one cached query
// (mirrors web's `allJobsInput`; tRPC batches it with the Bay list round-trip).
const allJobsInput = {
  filters: {},
  page: 1,
  pageSize: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} as const;

/**
 * Loads the Bay List: the cached Bay schedule (`jobs.listBays`) joined with the
 * Job list (`jobs.list`) for product names, deriving each Bay's active Job and
 * days-left. Mirrors web's `useShopFloorBays` + `ShopFloorTodayWidget` join.
 */
export function useBayList(): BayListState {
  const trpc = useTRPC();
  const connectivity = useConnectivity();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions(allJobsInput));
  const retry = useCallback(() => {
    void connectivity.refresh();
    void baysQuery.refetch();
    void jobsQuery.refetch();
  }, [baysQuery, connectivity, jobsQuery]);

  return useMemo<BayListState>(() => {
    const hasAllData = Boolean(baysQuery.data && jobsQuery.data);

    if (!hasAllData) {
      if (connectivity.isOffline || baysQuery.fetchStatus === 'paused' || jobsQuery.fetchStatus === 'paused') {
        return { status: 'offline', retry };
      }
      if (baysQuery.error) return { status: 'error', error: baysQuery.error, retry };
      if (jobsQuery.error) return { status: 'error', error: jobsQuery.error, retry };
      if (baysQuery.isPending || jobsQuery.isPending) return { status: 'pending' };
    }

    if (!baysQuery.data || !jobsQuery.data) {
      return { status: 'pending' };
    }

    const { items: bays, offDays, today } = baysQuery.data;
    const enabledBays = bays.filter((bay) => bay.disabledAt === null).sort(byDepartmentPipeline);
    const calendars = bayWorkingCalendars(enabledBays, offDays);
    const jobsById = new Map(jobsQuery.data.items.map((job) => [job.id, job] as const));

    const cards = enabledBays.map<BayListCard>((bay) => {
      const workingCalendar = calendars.get(bay.id);
      // Projected work slots span closure days too, so a slot can cover an off-day
      // today; gate on the bay calendar (mirrors web's getBayTodayOccupancy) so the
      // card never shows ACTIVE + a countdown on a day the bay is actually off.
      const slot = isWorkingDay(today, workingCalendar)
        ? bay.slots.find(
            (candidate): candidate is ProjectedWorkJobSlot =>
              candidate.kind === 'work' && candidate.startDate <= today && today < candidate.endDate,
          )
        : undefined;
      const job = slot ? jobsById.get(slot.jobId) : undefined;

      return {
        id: bay.id,
        name: bay.name,
        operator: bay.currentOperator,
        active:
          slot && job
            ? {
                ...deriveActiveJobProgress({ slot, today, workingCalendar }),
                jobCode: slot.jobCode,
                productName: job.productName,
                productThumbnailDataUrl: job.productThumbnailDataUrl,
              }
            : null,
      };
    });

    return { status: 'ready', cards, isOffline: connectivity.isOffline, retry, today };
  }, [
    baysQuery.data,
    baysQuery.error,
    baysQuery.fetchStatus,
    baysQuery.isPending,
    connectivity.isOffline,
    jobsQuery.data,
    jobsQuery.error,
    jobsQuery.fetchStatus,
    jobsQuery.isPending,
    retry,
  ]);
}
