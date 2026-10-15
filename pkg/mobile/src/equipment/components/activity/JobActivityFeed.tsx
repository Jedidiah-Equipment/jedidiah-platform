import { ACTIVITY_REFETCH_INTERVAL_MS } from '@pkg/domain';
import { jobActivityFilterLabels } from '@pkg/domain/equipment';
import type { DateIso, UUID } from '@pkg/schema';
import type { JobActivityFilter } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import type { ListControlOption } from '@/components/ListControls';
import { JobActivityEntry } from '@/equipment/components/activity/JobActivityEntry';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

const ACTIVITY_BATCH_SIZE = 20;
const FILTER_OPTIONS: readonly ListControlOption<JobActivityFilter>[] = (
  Object.keys(jobActivityFilterLabels) as JobActivityFilter[]
).map((value) => ({ label: jobActivityFilterLabels[value], value }));

export function JobActivityFeed({
  jobId,
  listHeader,
  renderPageToolbar,
  showControls = true,
  trackGlobalView = false,
}: {
  jobId?: string;
  listHeader?: ReactNode;
  renderPageToolbar?: (total: number | null) => ReactNode;
  showControls?: boolean;
  trackGlobalView?: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<JobActivityFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const activity = useInfiniteQuery(
    trpc.jobActivity.list.infiniteQueryOptions(
      {
        filter,
        jobId: jobId as UUID | undefined,
        limit: ACTIVITY_BATCH_SIZE,
        search: debouncedSearch || undefined,
      },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
        refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS,
      },
    ),
  );
  const items = useMemo(() => activity.data?.pages.flatMap((page) => page.items) ?? [], [activity.data?.pages]);
  const total = activity.data?.pages.at(-1)?.total ?? null;
  const lastSeenOptions = trpc.jobActivity.getLastActivitySeen.queryOptions();
  const { mutate: markActivitySeen } = useMutation(
    trpc.jobActivity.setLastActivitySeen.mutationOptions({
      onSuccess: (lastActivitySeen) => queryClient.setQueryData(lastSeenOptions.queryKey, lastActivitySeen),
    }),
  );
  const unfiltered = filter === 'all' && !debouncedSearch;
  const onViewedLatest = useCallback(
    (seenAt: DateIso) => {
      if (trackGlobalView && unfiltered) markActivitySeen({ seenAt });
    },
    [markActivitySeen, trackGlobalView, unfiltered],
  );

  return (
    <>
      {renderPageToolbar?.(total)}
      <ActivityTimeline
        controls={
          showControls
            ? {
                filter,
                filterOptions: FILTER_OPTIONS,
                onFilterChange: setFilter,
                search,
                onSearchChange: setSearch,
                searchPlaceholder: 'Search by text, user, Job, PO, Supplier, Product, or Customer…',
              }
            : undefined
        }
        emptyMessage={
          unfiltered
            ? {
                title: 'No activity yet',
                detail: jobId
                  ? 'Nothing has been said or done on this Job yet.'
                  : 'Nothing has been said or done on a Job yet.',
              }
            : { title: 'No activity matches', detail: 'Try another search or filter.' }
        }
        items={items}
        getItemKey={(item) => `${item.type}:${item.id}:${item.job.id}`}
        listHeader={listHeader}
        onViewedLatest={onViewedLatest}
        query={activity}
        renderItem={(item, last) => <JobActivityEntry item={item} jobId={jobId} last={last} />}
      />
    </>
  );
}
