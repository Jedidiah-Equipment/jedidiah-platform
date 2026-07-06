import { bayWorkingCalendars, type WorkingCalendar } from '@pkg/domain';
import type { BoardListInput, BoardListResult } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

export type BayCalendars = {
  offDays: BoardListResult['offDays'];
  today: BoardListResult['today'];
  workingCalendarsByBayId: Map<string, WorkingCalendar>;
};

export function selectBayCalendars(result: Pick<BoardListResult, 'items' | 'offDays' | 'today'>): BayCalendars {
  return {
    offDays: result.offDays,
    today: result.today,
    workingCalendarsByBayId: bayWorkingCalendars(result.items, result.offDays),
  };
}

export function useBayCalendars(
  input?: BoardListInput | undefined,
  options: { enabled?: boolean } = {},
): BayCalendars | null {
  const trpc = useTRPC();
  const baysQuery = useQuery(
    trpc.jobs.listBays.queryOptions(input, {
      enabled: options.enabled ?? true,
      // Keep the prior window's calendars during a history-floor refetch so the schedule board
      // does not unmount (plantToday going null) and reset the Gantt scroll back to today.
      placeholderData: keepPreviousData,
    }),
  );

  return useMemo(() => (baysQuery.data ? selectBayCalendars(baysQuery.data) : null), [baysQuery.data]);
}
