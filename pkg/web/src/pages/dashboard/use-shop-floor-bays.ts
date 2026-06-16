import { bayWorkingCalendars, type WorkingCalendar } from '@pkg/domain';
import type { BaySchedule, DateOnlyIso, OffDay } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { listEnabledBays } from './bay-schedule-derivations.js';

export type ShopFloorBays =
  | { status: 'error'; error: unknown }
  | { status: 'pending' }
  | {
      status: 'ready';
      enabledBays: BaySchedule[];
      offDays: OffDay[];
      today: DateOnlyIso;
      workingCalendarsByBayId: Map<string, WorkingCalendar>;
    };

/**
 * Shared loader for the shop-floor dashboard widgets. Fetches the cached Bay list once (React Query
 * dedupes across the widgets that call it), filters to enabled Bays, and builds each Bay's working
 * calendar. Widgets keep ownership of their own skeletons, error copy, and empty states.
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
      offDays: baysQuery.data.offDays,
      status: 'ready',
      today: baysQuery.data.today,
      workingCalendarsByBayId: bayWorkingCalendars(enabledBays, baysQuery.data.offDays),
    };
  }, [baysQuery.data, baysQuery.error, baysQuery.isPending]);
}
