import { bayWorkingCalendars, type WorkingCalendar } from '@pkg/domain';
import type { BoardListResult } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from './trpc';

export type BayCalendars = {
  offDays: BoardListResult['offDays'];
  today: BoardListResult['today'];
  workingCalendarsByBayId: Map<string, WorkingCalendar>;
};

export function useBayCalendars(options: { enabled?: boolean } = {}): BayCalendars | null {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(undefined, { enabled: options.enabled ?? true }));

  return useMemo(
    () =>
      baysQuery.data
        ? {
            offDays: baysQuery.data.offDays,
            today: baysQuery.data.today,
            workingCalendarsByBayId: bayWorkingCalendars(baysQuery.data.items, baysQuery.data.offDays),
          }
        : null,
    [baysQuery.data],
  );
}
