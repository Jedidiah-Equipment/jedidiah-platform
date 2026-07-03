import {
  type ActiveJobProgress,
  byBayDepartmentPipeline,
  deriveActiveJobProgress,
  findActiveWorkSlot,
  hasPermission,
  listEnabledBays,
} from '@pkg/domain';
import type { BayOperator, DateOnlyIso } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { getJobDisplayName } from './job-display';
import { useTRPC } from './trpc';
import { useAccess } from './use-access';
import { useBayCalendars } from './use-bay-calendars';

/** A Bay card's active Job, joined from `jobs.listBays` detail and projected for days-left. */
export type BayListActiveJob = ActiveJobProgress & {
  jobCode: string;
  productName: string;
  productThumbnailDataUrl: string | null;
  customerCompanyName: string | null;
};

export type BayListCard = {
  id: string;
  name: string;
  operator: BayOperator | null;
  /** Null when no Work Slot covers today (idle/free/off) — the card shows an idle state. */
  active: BayListActiveJob | null;
};

export type BayListState =
  | { status: 'error'; error: unknown }
  | { status: 'forbidden' }
  | { status: 'pending' }
  | { status: 'ready'; cards: BayListCard[]; today: DateOnlyIso };

export type UseBayListResult = {
  state: BayListState;
  /** Refetch access + the Board, e.g. from pull-to-refresh. */
  refresh: () => void;
  isRefreshing: boolean;
};

/**
 * Loads the Bay List from the cached Board (`jobs.listBays`), whose `jobs`
 * carry each scheduled Job's product detail, deriving each Bay's active Job and
 * days-left. Mirrors web's `useShopFloorBays` + `ShopFloorTodayWidget`.
 *
 * `jobs.listBays` requires `job:read`, so we gate it on the user's access summary
 * and surface a `forbidden` state rather than firing a request that 403s and reads
 * as a connection error (mirrors web gating shop-floor widgets with `hasPermission`).
 */
export function useBayList(): UseBayListResult {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canReadJobs = hasPermission(accessQuery.data, 'job:read');
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(undefined, { enabled: canReadJobs }));
  const bayCalendars = useBayCalendars({ enabled: canReadJobs });

  const state = useMemo<BayListState>(() => {
    if (accessQuery.isPending) return { status: 'pending' };
    // Access genuinely failed to load (e.g. offline first open) — distinct from a resolved
    // summary that simply lacks `job:read`, which is `forbidden` below.
    if (accessQuery.error && accessQuery.data === undefined) return { status: 'error', error: accessQuery.error };
    if (!canReadJobs) return { status: 'forbidden' };

    if (baysQuery.error) return { status: 'error', error: baysQuery.error };
    if (baysQuery.isPending || !bayCalendars) return { status: 'pending' };

    const { items: bays, jobs, today } = baysQuery.data;
    const enabledBays = listEnabledBays(bays).sort(byBayDepartmentPipeline);
    const jobsById = new Map(jobs.map((job) => [job.id, job] as const));

    const cards = enabledBays.map<BayListCard>((bay) => {
      const workingCalendar = bayCalendars.workingCalendarsByBayId.get(bay.id) ?? {};
      const slot = findActiveWorkSlot({ bay });
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
                productName: getJobDisplayName(job),
                productThumbnailDataUrl: job.productThumbnailDataUrl,
                customerCompanyName: job.customerCompanyName,
              }
            : null,
      };
    });

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
