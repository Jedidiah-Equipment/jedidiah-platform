import { activityFilterLabels, fieldReaderOpensJob } from '@pkg/domain/contracting';
import { type ActivityFilter, activityFilters } from '@pkg/schema/contracting';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import { useActivityViewMark } from '@/components/activity/use-activity-view';
import type { ListControlOption } from '@/components/ListControls';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { ActivityEntry, type ActivityThreadRef } from './ActivityEntry';
import { useActivityFeed, useContractingActivityViewClient } from './use-activity';

const FILTER_OPTIONS: readonly ListControlOption<ActivityFilter>[] = activityFilters.map((value) => ({
  label: activityFilterLabels[value],
  value,
}));

/** The Contracting feed: every reachable item on the Activity tab, or one Job's or one Breakdown's thread. */
export function ContractingActivityFeed({
  thread,
  listHeader,
  showControls = true,
  trackGlobalView = false,
}: {
  thread?: ActivityThreadRef;
  listHeader?: ReactNode;
  showControls?: boolean;
  trackGlobalView?: boolean;
}) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const activity = useActivityFeed({ filter, search: debouncedSearch, thread });
  const items = useMemo(() => activity.data?.pages.flatMap((page) => page.items) ?? [], [activity.data?.pages]);
  const onViewedLatest = useActivityViewMark(useContractingActivityViewClient(), {
    track: trackGlobalView,
    filter,
    search: debouncedSearch,
    scoped: thread !== undefined,
  });
  const unfiltered = filter === 'all' && !debouncedSearch;
  const access = useSessionAccessSummary();
  const scope = useMemo(
    () => ({
      thread,
      // The phone's Job screen reads through the field Job gate, which the workshop does not pass.
      canOpenJob: (job: { foremanUserId: string | null }) => fieldReaderOpensJob(access, job),
    }),
    [access, thread],
  );
  const subject = { breakdown: 'this Breakdown', job: 'this Job', none: 'your Jobs and Breakdowns' }[
    thread?.kind ?? 'none'
  ];

  return (
    <ActivityTimeline
      controls={
        showControls
          ? {
              filter,
              filterOptions: FILTER_OPTIONS,
              onFilterChange: setFilter,
              search,
              onSearchChange: setSearch,
              searchPlaceholder: 'Search notes, people, Jobs, Machines or Farms…',
            }
          : undefined
      }
      emptyMessage={
        unfiltered
          ? { title: 'No activity yet', detail: `Nothing has been said or done on ${subject} yet.` }
          : { title: 'No activity matches', detail: 'Try another search or filter.' }
      }
      items={items}
      listHeader={listHeader}
      onViewedLatest={onViewedLatest}
      query={activity}
      renderItem={(item, last) => <ActivityEntry item={item} last={last} scope={scope} />}
      underSecondaryToolbar={thread !== undefined}
    />
  );
}
