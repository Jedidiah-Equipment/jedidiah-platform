import { ACTIVITY_REFETCH_INTERVAL_MS } from '@pkg/domain';
import type { DateIso, UUID } from '@pkg/schema';
import type { JobActivityFilter } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type React from 'react';

import { ActivityTimeline } from '@/components/activity/ActivityTimeline.js';
import { WEB_LIST_BATCH_SIZE } from '@/components/data-table/constants.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { JobActivityEntry } from './JobActivityEntry.js';

/**
 * The Equipment feed, newest first: every Job, or one Job's thread. Only the unfiltered, unsearched, unscoped feed
 * reports that it was viewed, the same rule Contracting's feed and the phone apply.
 */
export const JobActivityFeed: React.FC<{
  filter?: JobActivityFilter;
  jobId?: UUID;
  onGlobalFeedViewed?: (seenAt: DateIso) => void;
  search?: string;
}> = ({ filter = 'all', jobId, onGlobalFeedViewed, search = '' }) => {
  const trpc = useTRPC();
  const purchaseOrderAccess = useCan('equipment_purchase_order:read');
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

  return (
    <ActivityTimeline
      emptyMessage={getEmptyMessage({ filter, filteredToJob: jobId !== undefined, searching: search.length > 0 })}
      errorMessage="Unable to load job activity."
      items={items}
      getItemKey={(item) => `${item.type}:${item.id}:${item.job.id}`}
      onViewedLatest={filter === 'all' && !jobId && !search ? onGlobalFeedViewed : undefined}
      query={activityQuery}
      renderItem={(item) => (
        <JobActivityEntry canReadPurchaseOrder={purchaseOrderAccess.can} item={item} jobId={jobId} />
      )}
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
