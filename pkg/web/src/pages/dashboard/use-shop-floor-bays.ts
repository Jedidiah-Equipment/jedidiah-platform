import { listEnabledBays, type WorkingCalendar } from '@pkg/domain';
import type { DateOnlyIso, JobSummary, OffDay, ProjectedBayQueue } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useBayCalendars } from '@/hooks/use-bay-calendars.js';
import { useTRPC } from '@/lib/trpc.js';

export type ShopFloorBays =
  | { status: 'error'; error: unknown }
  | { status: 'pending' }
  | {
      status: 'ready';
      enabledBays: ProjectedBayQueue[];
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
  const bayCalendars = useBayCalendars();

  return useMemo<ShopFloorBays>(() => {
    if (baysQuery.error) {
      return { error: baysQuery.error, status: 'error' };
    }

    if (baysQuery.isPending || !bayCalendars) {
      return { status: 'pending' };
    }

    const cancelledJobIds = new Set(baysQuery.data.jobs.filter((job) => job.cancelledAt !== null).map((job) => job.id));
    // The Board keeps cancelled Slots for history; dashboard widgets are live operational lists, so
    // remove those Slots at this consumer boundary without changing the truthful Board response.
    const enabledBays = listEnabledBays(baysQuery.data.items).map((bay) => ({
      ...bay,
      slots: bay.slots.filter((slot) => slot.kind === 'idle' || !cancelledJobIds.has(slot.jobId)),
    }));
    const liveJobs = baysQuery.data.jobs.filter((job) => job.cancelledAt === null);

    return {
      enabledBays,
      jobsById: new Map(liveJobs.map((job) => [job.id, job])),
      offDays: bayCalendars.offDays,
      status: 'ready',
      today: bayCalendars.today,
      workingCalendarsByBayId: bayCalendars.workingCalendarsByBayId,
    };
  }, [bayCalendars, baysQuery.data, baysQuery.error, baysQuery.isPending]);
}
