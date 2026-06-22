import { bayWorkingCalendars, listEnabledBays, type WorkingCalendar } from '@pkg/domain';
import type { BaySchedule, DateOnlyIso, JobSummary, OffDay } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

export type ShopFloorBays =
  | { status: 'error'; error: unknown }
  | { status: 'pending' }
  | {
      status: 'ready';
      enabledBays: BaySchedule[];
      /** Product/customer detail for the Jobs on the board, keyed by Job id, from `jobs.listBays`. */
      jobsById: ReadonlyMap<string, JobSummary>;
      offDays: OffDay[];
      today: DateOnlyIso;
      workingCalendarsByBayId: Map<string, WorkingCalendar>;
    };

/**
 * Shared loader for the shop-floor dashboard widgets. Fetches the cached Bay list once (React Query
 * dedupes across the widgets that call it), filters to enabled Bays, and builds each Bay's working
 * calendar. The Bay list carries the scheduled Jobs' product detail, so widgets label Slots without a
 * separate unpaged Jobs read. Widgets keep ownership of their own skeletons, error copy, and empty states.
 */
export function useShopFloorBays(): ShopFloorBays {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());

  return useMemo<ShopFloorBays>(() => {
    if (baysQuery.error) {
      return { error: baysQuery.error, status: 'error' };
    }

    if (baysQuery.isPending) {
      return { status: 'pending' };
    }

    const enabledBays = listEnabledBays(baysQuery.data.items);

    return {
      enabledBays,
      jobsById: new Map(baysQuery.data.jobs.map((job) => [job.id, job])),
      offDays: baysQuery.data.offDays,
      status: 'ready',
      today: baysQuery.data.today,
      workingCalendarsByBayId: bayWorkingCalendars(enabledBays, baysQuery.data.offDays),
    };
  }, [baysQuery.data, baysQuery.error, baysQuery.isPending]);
}
