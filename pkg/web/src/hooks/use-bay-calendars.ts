import { bayWorkingCalendars, type WorkingCalendar } from '@pkg/domain';
import type { BayListInput, BayListResult } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

export type BayCalendars = {
  offDays: BayListResult['offDays'];
  today: BayListResult['today'];
  workingCalendarsByBayId: Map<string, WorkingCalendar>;
};

export function selectBayCalendars(result: Pick<BayListResult, 'items' | 'offDays' | 'today'>): BayCalendars {
  return {
    offDays: result.offDays,
    today: result.today,
    workingCalendarsByBayId: bayWorkingCalendars(result.items, result.offDays),
  };
}

export function useBayCalendars(
  input?: BayListInput | undefined,
  options: { enabled?: boolean } = {},
): BayCalendars | null {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(input, { enabled: options.enabled ?? true }));

  return useMemo(() => (baysQuery.data ? selectBayCalendars(baysQuery.data) : null), [baysQuery.data]);
}
