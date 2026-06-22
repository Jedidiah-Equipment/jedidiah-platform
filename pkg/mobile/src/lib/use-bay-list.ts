import {
  type ActiveJobProgress,
  bayWorkingCalendars,
  byBayDepartmentPipeline,
  deriveActiveJobProgress,
  findActiveWorkSlot,
  listEnabledBays,
} from '@pkg/domain';
import type { BayOperator, DateOnlyIso } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from './trpc';

/** A Bay card's active Job, joined from `jobs.listBays` detail and projected for days-left. */
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
  | { status: 'error'; error: unknown }
  | { status: 'pending' }
  | { status: 'ready'; cards: BayListCard[]; today: DateOnlyIso };

/**
 * Loads the Bay List from the cached Bay schedule (`jobs.listBays`), whose `jobs`
 * carry each scheduled Job's product detail, deriving each Bay's active Job and
 * days-left. Mirrors web's `useShopFloorBays` + `ShopFloorTodayWidget`.
 */
export function useBayList(): BayListState {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());

  return useMemo<BayListState>(() => {
    if (baysQuery.error) return { status: 'error', error: baysQuery.error };
    if (baysQuery.isPending) return { status: 'pending' };

    const { items: bays, jobs, offDays, today } = baysQuery.data;
    const enabledBays = listEnabledBays(bays).sort(byBayDepartmentPipeline);
    const calendars = bayWorkingCalendars(enabledBays, offDays);
    const jobsById = new Map(jobs.map((job) => [job.id, job] as const));

    const cards = enabledBays.map<BayListCard>((bay) => {
      const workingCalendar = calendars.get(bay.id) ?? {};
      const slot = findActiveWorkSlot({ bay, today, workingCalendar });
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

    return { status: 'ready', cards, today };
  }, [baysQuery.data, baysQuery.error, baysQuery.isPending]);
}
