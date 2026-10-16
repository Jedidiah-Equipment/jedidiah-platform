import { ACTIVITY_REFETCH_INTERVAL_MS } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import type { ActivityFilter } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ActivityTimeline } from '@/components/activity/ActivityTimeline.js';
import { useActivityViewMark } from '@/components/activity/use-activity-view.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { ActivityEntry } from './ActivityEntry.js';
import { useContractingActivityViewClient } from './activity-view-client.js';

const ACTIVITY_PAGE_SIZE = 20;

/**
 * The Contracting feed, keyset-paged newest first: everything the reader reaches, or one Job's thread (its Breakdowns
 * included) or one Breakdown's. Only the Activity page tracks the global view.
 */
export function ActivityFeed({
  filter = 'all',
  search = '',
  jobId,
  breakdownId,
  trackGlobalView = false,
}: {
  filter?: ActivityFilter;
  search?: string;
  jobId?: UUID;
  breakdownId?: UUID;
  trackGlobalView?: boolean;
}) {
  const trpc = useTRPC();
  const canOpenJob = useCan('contracting_job:read').can;
  const query = useInfiniteQuery(
    trpc.contractingActivity.list.infiniteQueryOptions(
      { filter, search: search || undefined, jobId, breakdownId, limit: ACTIVITY_PAGE_SIZE },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: null,
        placeholderData: keepPreviousData,
        refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS,
      },
    ),
  );
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data?.pages]);
  const onViewedLatest = useActivityViewMark(useContractingActivityViewClient(), {
    track: trackGlobalView,
    filter,
    search,
    scoped: jobId !== undefined || breakdownId !== undefined,
  });
  const unfiltered = filter === 'all' && !search;

  const subject = breakdownId ? 'this Breakdown' : jobId ? 'this Job' : 'your Jobs and Breakdowns';
  return (
    <ActivityTimeline
      emptyMessage={
        unfiltered ? `Nothing has been said or done on ${subject} yet.` : 'No activity matches this search or filter.'
      }
      errorMessage="Unable to load Activity."
      getItemKey={(item) => `${item.type}:${item.id}`}
      items={items}
      onViewedLatest={onViewedLatest}
      query={query}
      renderItem={(item) => <ActivityEntry item={item} scope={{ jobId, breakdownId, canOpenJob }} />}
    />
  );
}
