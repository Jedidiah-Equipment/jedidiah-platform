import { ACTIVITY_REFETCH_INTERVAL_MS } from '@pkg/domain';
import { canSeeActivity } from '@pkg/domain/contracting';
import type { UUID } from '@pkg/schema';
import type { ActivityFilter } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useActivityUnread as useBusinessActivityUnread } from '@/components/activity/use-activity-unread';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

const ACTIVITY_PAGE_SIZE = 20;

/** Whether this person has Activity at all: a Jobs or a Workshop reach. */
export function useCanSeeActivity() {
  return canSeeActivity(useSessionAccessSummary());
}

/** The Contracting feed, keyset-paged newest first; scoped to one Job or one Breakdown when either is named. */
export function useActivityFeed({
  filter,
  search,
  jobId,
  breakdownId,
}: {
  filter: ActivityFilter;
  search: string;
  jobId?: string;
  breakdownId?: string;
}) {
  const trpc = useTRPC();
  const enabled = useCanSeeActivity();
  return useInfiniteQuery(
    trpc.contractingActivity.list.infiniteQueryOptions(
      {
        filter,
        search: search || undefined,
        jobId: jobId as UUID | undefined,
        breakdownId: breakdownId as UUID | undefined,
        limit: ACTIVITY_PAGE_SIZE,
      },
      {
        enabled,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: null,
        placeholderData: keepPreviousData,
        refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS,
      },
    ),
  );
}

/** Whether the newest item lies beyond this person's Contracting Activity View: the Activity tab's dot. */
export function useActivityUnread() {
  const trpc = useTRPC();
  return useBusinessActivityUnread({
    enabled: useCanSeeActivity(),
    lastSeen: trpc.contractingActivity.getLastSeen.queryOptions(),
    latest: trpc.contractingActivity.list.queryOptions({ limit: 1 }),
  });
}
