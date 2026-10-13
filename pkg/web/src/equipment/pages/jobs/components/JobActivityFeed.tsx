import type { DateIso, UUID } from '@pkg/schema';
import type { JobActivityFilter } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect } from 'react';

import { ACTIVITY_REFETCH_INTERVAL_MS, ActivityTimeline } from '@/components/activity/ActivityTimeline.js';
import { WEB_LIST_BATCH_SIZE } from '@/components/data-table/constants.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { useTRPC } from '@/lib/trpc.js';

import { JobActivityEntry } from './JobActivityEntry.js';

export const JobActivityFeed: React.FC<{
  filter?: JobActivityFilter;
  hideDetail?: boolean;
  jobId?: UUID;
  onGlobalFeedViewed?: (seenAt: DateIso) => void;
  search?: string;
}> = ({ filter = 'all', hideDetail = false, jobId, onGlobalFeedViewed, search = '' }) => {
  const trpc = useTRPC();
  const activityQuery = useInfiniteQuery(
    trpc.jobActivity.list.infiniteQueryOptions(
      { filter, limit: WEB_LIST_BATCH_SIZE, search, ...(jobId ? { jobId } : {}) },
      {
        ...cursorInfiniteQueryOptions,
        placeholderData: keepPreviousData,
        refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS,
      },
    ),
  );
  const { items } = useCombinedCursorQueryPages(activityQuery.data?.pages);
  const latestActivityAt = items[0]?.occurredAt;

  useEffect(() => {
    if (activityQuery.isSuccess && latestActivityAt !== undefined && filter === 'all' && !jobId && !search) {
      onGlobalFeedViewed?.(latestActivityAt);
    }
  }, [activityQuery.isSuccess, filter, jobId, latestActivityAt, onGlobalFeedViewed, search]);

  return (
    <ActivityTimeline
      emptyMessage={getEmptyMessage({ filter, filteredToJob: jobId !== undefined, searching: search.length > 0 })}
      errorMessage="Unable to load job activity."
      items={items}
      query={activityQuery}
      renderItem={(item) => <JobActivityEntry hideDetail={hideDetail} item={item} />}
    />
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
