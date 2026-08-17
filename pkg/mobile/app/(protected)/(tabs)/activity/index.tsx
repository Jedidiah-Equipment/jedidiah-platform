import type { JobActivityFilter, JobActivityItem } from '@pkg/schema';
import { IconFilter } from '@tabler/icons-react-native';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobActivityEntry } from '@/components/activity/JobActivityEntry';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { MainTabToolbar } from '@/components/TopToolbar';
import { Pulse } from '@/components/ui/pulse';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';
import { groupJobActivityByDay } from '@/lib/job-activity';
import { MAIN_TAB_PARENTS } from '@/lib/toolbar-navigation';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { useGlobalRefresh } from '@/lib/use-global-refresh';

const ACTIVITY_BATCH_SIZE = 20;
const ACTIVITY_REFETCH_INTERVAL_MS = 60_000;
const FILTER_OPTIONS: readonly ListControlOption<JobActivityFilter>[] = [
  { label: 'All', value: 'all' },
  { label: 'User Feedback', value: 'user-feedback' },
  { label: 'Job Events', value: 'job-events' },
];

/** Cross-Job feed. The Activity layout owns the route-level permission gate. */
export default function ActivityRoute() {
  const trpc = useTRPC();
  const [filter, setFilter] = useState<JobActivityFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const refresh = useGlobalRefresh();
  const activity = useInfiniteQuery(
    trpc.jobActivity.list.infiniteQueryOptions(
      { filter, limit: ACTIVITY_BATCH_SIZE, search: debouncedSearch || undefined },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
        refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS,
      },
    ),
  );
  const items = useMemo(() => activity.data?.pages.flatMap((page) => page.items) ?? [], [activity.data?.pages]);
  const sections = useMemo(() => groupJobActivityByDay(items), [items]);
  const total = activity.data?.pages.at(-1)?.total ?? null;
  const loadMoreRequestedRef = useRef(false);

  useEffect(() => {
    if (!activity.isFetchingNextPage) loadMoreRequestedRef.current = false;
  }, [activity.isFetchingNextPage]);

  const loadMore = () => {
    if (!activity.hasNextPage || activity.isFetchingNextPage || activity.isPending || loadMoreRequestedRef.current) {
      return;
    }

    // SectionList can fire repeatedly before React Query exposes the in-flight page request.
    loadMoreRequestedRef.current = true;
    void activity.fetchNextPage();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar
        assistantParent={MAIN_TAB_PARENTS.activity}
        helpTopic="jobActivity"
        subtitle={total === null ? 'Loading activity…' : `${total} ${total === 1 ? 'entry' : 'entries'}, newest first`}
        title="Activity"
      />
      <SectionList
        className="flex-1"
        contentContainerClassName="px-4 pb-8 pt-1"
        initialNumToRender={12}
        keyExtractor={activityKey}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View className="pt-4">
            {activity.isPending ? (
              <ActivitySkeleton />
            ) : activity.isError ? (
              <ActivityMessage detail="Pull to retry, or check your connection." title="Couldn’t load activity." />
            ) : (
              <ActivityMessage
                detail={
                  filter === 'all' && !debouncedSearch
                    ? 'Nothing has been said or done on a Job yet.'
                    : 'Try another search or filter.'
                }
                title={filter === 'all' && !debouncedSearch ? 'No activity yet' : 'No activity matches'}
              />
            )}
          </View>
        }
        ListFooterComponent={
          activity.isFetchingNextPage ? (
            <Text className="pb-1 pt-2 text-center text-xs text-muted-foreground">Loading more activity…</Text>
          ) : null
        }
        ListHeaderComponent={
          <View className="z-10 mb-4">
            <ListControlRow
              leading={
                <ListSearchControl
                  accessibilityLabel="Search activity"
                  onChangeText={setSearch}
                  placeholder="Search by text, user, job, product, or customer…"
                  value={search}
                />
              }
              trailing={
                <ListDropdownControl
                  accessibilityLabel="Filter activity"
                  defaultValue="all"
                  dismissLabel="Close activity filter"
                  icon={IconFilter}
                  onChange={setFilter}
                  options={FILTER_OPTIONS}
                  value={filter}
                />
              }
            />
          </View>
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl onRefresh={refresh.onRefresh} refreshing={refresh.refreshing} />}
        renderItem={({ index, item, section }) => (
          <JobActivityEntry item={item} last={index === section.data.length - 1} />
        )}
        renderSectionHeader={({ section }) => (
          <View
            className={
              section.day === sections[0]?.day ? 'mb-3 bg-background' : 'mb-3 border-t border-border bg-background pt-6'
            }
          >
            <Text className="text-[11px] uppercase tracking-[1.5px] text-foreground" weight="semibold">
              {section.label}
            </Text>
          </View>
        )}
        sections={sections}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

function activityKey(item: JobActivityItem): string {
  return `${item.type}:${item.id}`;
}

function ActivityMessage({ detail, title }: { detail: string; title: string }) {
  return (
    <View className="rounded-xl border border-border bg-surface p-4">
      <Text className="text-sm text-foreground" weight="semibold">
        {title}
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">{detail}</Text>
    </View>
  );
}

function ActivitySkeleton() {
  return (
    <View className="gap-4">
      {['a', 'b', 'c', 'd'].map((key) => (
        <View className="flex-row items-start gap-2" key={key}>
          <Pulse className="h-7 w-11 rounded" />
          <Pulse className="h-7 w-7 rounded-full" />
          <View className="min-w-0 flex-1 gap-2">
            <Pulse className="h-4 w-3/4 rounded" />
            <Pulse className="h-4 w-full rounded" />
            <Pulse className="h-4 w-1/2 rounded" />
          </View>
        </View>
      ))}
    </View>
  );
}
