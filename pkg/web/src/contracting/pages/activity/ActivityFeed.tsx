import type { DateIso, UUID } from '@pkg/schema';
import type { ActivityFilter } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { ActivityTimeline } from '@/components/activity/ActivityTimeline.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { ActivityEntry } from './ActivityEntry.js';

const ACTIVITY_PAGE_SIZE = 20;
/** How often an open feed picks up activity from the phones. */
export const ACTIVITY_REFETCH_INTERVAL_MS = 60_000;

/**
 * The Contracting feed, keyset-paged newest first: everything the reader reaches, or one Job's thread (its Breakdowns
 * included) or one Breakdown's. Only the unfiltered, unsearched, unscoped feed reports that it was viewed, the same
 * rule Equipment's feed and the phone apply.
 */
export function ActivityFeed({
  filter = 'all',
  search = '',
  jobId,
  breakdownId,
  onGlobalFeedViewed,
}: {
  filter?: ActivityFilter;
  search?: string;
  jobId?: UUID;
  breakdownId?: UUID;
  onGlobalFeedViewed?: (newestOccurredAt: DateIso) => void;
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
  const newestOccurredAt = items[0]?.occurredAt;
  const scoped = jobId !== undefined || breakdownId !== undefined;
  const unfiltered = filter === 'all' && !search;

  useEffect(() => {
    if (query.isSuccess && newestOccurredAt !== undefined && unfiltered && !scoped)
      onGlobalFeedViewed?.(newestOccurredAt);
  }, [query.isSuccess, newestOccurredAt, unfiltered, scoped, onGlobalFeedViewed]);

  const subject = breakdownId ? 'this Breakdown' : jobId ? 'this Job' : 'your Jobs and Breakdowns';
  return (
    <ActivityTimeline
      emptyMessage={
        unfiltered ? `Nothing has been said or done on ${subject} yet.` : 'No activity matches this search or filter.'
      }
      errorMessage="Unable to load Activity."
      items={items}
      query={query}
      renderItem={(item) => <ActivityEntry item={item} scope={{ jobId, breakdownId, canOpenJob }} />}
    />
  );
}
