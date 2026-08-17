import type { JobActivityFilter, UUID } from '@pkg/schema';
import { useInfiniteQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useRef } from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { WEB_LIST_BATCH_SIZE } from '@/components/data-table/constants.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

import { JobActivityTimeline } from './JobActivityTimeline.js';

/** How often an open feed picks up activity submitted elsewhere. */
const ACTIVITY_REFETCH_INTERVAL_MS = 60_000;

export const JobActivityFeed: React.FC<{
  filter?: JobActivityFilter;
  hideDetail?: boolean;
  jobId?: UUID;
  search?: string;
}> = ({ filter = 'all', hideDetail = false, jobId, search = '' }) => {
  const trpc = useTRPC();
  const activityQuery = useInfiniteQuery(
    trpc.jobActivity.list.infiniteQueryOptions(
      { filter, limit: WEB_LIST_BATCH_SIZE, search, ...(jobId ? { jobId } : {}) },
      {
        ...cursorInfiniteQueryOptions,
        refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS,
      },
    ),
  );
  const { items } = useCombinedCursorQueryPages(activityQuery.data?.pages);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadMore = loadMoreRef.current;

    if (!loadMore || !activityQuery.hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !activityQuery.isFetchingNextPage) {
          void activityQuery.fetchNextPage();
        }
      },
      { rootMargin: '256px 0px' },
    );

    observer.observe(loadMore);

    return () => observer.disconnect();
  }, [activityQuery.fetchNextPage, activityQuery.hasNextPage, activityQuery.isFetchingNextPage]);

  return (
    <div className="grid gap-6">
      <ErrorMessage error={activityQuery.error} fallbackMessage="Unable to load job activity." />
      {activityQuery.isPending ? <Skeleton className="h-24" /> : null}
      {activityQuery.isSuccess && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {getEmptyMessage({ filter, filteredToJob: jobId !== undefined, searching: search.length > 0 })}
        </p>
      ) : null}
      {items.length > 0 ? <JobActivityTimeline hideDetail={hideDetail} items={items} /> : null}
      {activityQuery.hasNextPage ? <div aria-hidden className="h-px" ref={loadMoreRef} /> : null}
    </div>
  );
};

function getEmptyMessage({
  filter,
  filteredToJob,
  searching,
}: {
  filter: JobActivityFilter;
  filteredToJob: boolean;
  searching: boolean;
}): string {
  if (searching || filter !== 'all') {
    return 'No activity matches this search or filter.';
  }

  return filteredToJob
    ? 'Nothing has been said or done on this Job yet.'
    : 'Nothing has been said or done on a Job yet.';
}
