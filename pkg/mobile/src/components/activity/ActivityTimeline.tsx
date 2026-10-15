import { groupActivityByDay } from '@pkg/domain';
import type { DateIso } from '@pkg/schema';
import { IconFilter } from '@tabler/icons-react-native';
import { useFocusEffect } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SectionList, View } from 'react-native';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { MAIN_PAGE_CONTENT_STYLE, SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { Pulse } from '@/components/ui/pulse';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';

/** What a timeline needs of its infinite query; both businesses' feeds hand theirs over as is. */
export type ActivityTimelineQuery = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
};

/**
 * A day-grouped, paged activity timeline with the shared filter dropdown and search. Business-blind: each business
 * owns its query, its filters and its entries, and passes them in.
 */
export function ActivityTimeline<
  TItem extends { id: string; type: string; occurredAt: DateIso },
  TFilter extends string,
>({
  query,
  getItemKey = activityKey,
  items,
  controls,
  emptyMessage,
  listHeader,
  onViewedLatest,
  renderItem,
  underSecondaryToolbar = false,
}: {
  getItemKey?: (item: TItem) => string;
  query: ActivityTimelineQuery;
  items: readonly TItem[];
  /** The filter and search row; absent on a scoped thread that shows everything. */
  controls?: {
    filter: TFilter;
    filterOptions: readonly ListControlOption<TFilter>[];
    onFilterChange: (filter: TFilter) => void;
    search: string;
    onSearchChange: (search: string) => void;
    searchPlaceholder: string;
  };
  emptyMessage: { title: string; detail: string };
  listHeader?: ReactNode;
  /** Called with the newest item's instant while the screen is focused and the feed has loaded. */
  onViewedLatest?: (occurredAt: DateIso) => void;
  renderItem: (item: TItem, last: boolean) => ReactElement;
  /** A detail page's thread sits under a secondary toolbar, a tab root under a main one. */
  underSecondaryToolbar?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const sections = useMemo(
    () => groupActivityByDay(items).map(({ items: data, ...day }) => ({ ...day, data })),
    [items],
  );
  const latestActivityAt = items[0]?.occurredAt;
  const loadMoreRequestedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (focused && query.isSuccess && latestActivityAt !== undefined) onViewedLatest?.(latestActivityAt);
  }, [focused, latestActivityAt, onViewedLatest, query.isSuccess]);

  useEffect(() => {
    if (!query.isFetchingNextPage) loadMoreRequestedRef.current = false;
  }, [query.isFetchingNextPage]);

  const loadMore = () => {
    if (!query.hasNextPage || query.isFetchingNextPage || query.isPending || loadMoreRequestedRef.current) return;
    // SectionList can fire repeatedly before React Query exposes the in-flight page request.
    loadMoreRequestedRef.current = true;
    void query.fetchNextPage();
  };

  return (
    <SectionList
      className="flex-1"
      // NativeWind does not remap contentContainerClassName for SectionList.
      contentContainerStyle={underSecondaryToolbar ? SECONDARY_PAGE_CONTENT_STYLE : MAIN_PAGE_CONTENT_STYLE}
      initialNumToRender={12}
      keyExtractor={getItemKey}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <View className="pt-4">
          {query.isPending ? (
            <ActivitySkeleton />
          ) : query.isError ? (
            <ActivityMessage detail="Pull to retry, or check your connection." title="Couldn’t load activity." />
          ) : (
            <ActivityMessage detail={emptyMessage.detail} title={emptyMessage.title} />
          )}
        </View>
      }
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <Text className="pb-1 pt-2 text-center text-xs text-muted-foreground">Loading more activity…</Text>
        ) : null
      }
      ListHeaderComponent={
        listHeader || controls ? (
          <View className="z-10 mb-4 gap-4">
            {listHeader}
            {controls ? (
              <ListControlRow
                leading={
                  <ListSearchControl
                    accessibilityLabel="Search activity"
                    onChangeText={controls.onSearchChange}
                    placeholder={controls.searchPlaceholder}
                    value={controls.search}
                  />
                }
                trailing={
                  <ListDropdownControl
                    accessibilityLabel="Filter activity"
                    defaultValue={controls.filterOptions[0]?.value ?? controls.filter}
                    dismissLabel="Close activity filter"
                    icon={IconFilter}
                    onChange={controls.onFilterChange}
                    options={controls.filterOptions}
                    value={controls.filter}
                  />
                }
              />
            ) : null}
          </View>
        ) : null
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl />}
      renderItem={({ index, item, section }) => renderItem(item, index === section.data.length - 1)}
      renderSectionHeader={({ section }) => (
        <ActivityDayHeading first={section.day === sections[0]?.day} label={section.label} />
      )}
      sections={sections}
      stickySectionHeadersEnabled={false}
    />
  );
}

/**
 * A short thread drawn whole, as day groups, inside a page that already scrolls; a feed that pages is an
 * {@link ActivityTimeline} instead.
 */
export function ActivityDayGroups<TItem extends { occurredAt: DateIso }>({
  getItemKey,
  items,
  renderItem,
}: {
  getItemKey: (item: TItem) => string;
  items: readonly TItem[];
  renderItem: (item: TItem, last: boolean) => ReactElement;
}) {
  return groupActivityByDay(items).map((group, index) => (
    <View key={group.day}>
      <ActivityDayHeading first={index === 0} label={group.label} />
      {group.items.map((item, itemIndex) => (
        <Fragment key={getItemKey(item)}>{renderItem(item, itemIndex === group.items.length - 1)}</Fragment>
      ))}
    </View>
  ));
}

/** A day's heading: the first sits under whatever heads the list, and each later day rules itself off. */
function ActivityDayHeading({ first, label }: { first: boolean; label: string }) {
  return (
    <View className={first ? 'mb-3' : 'mb-3 border-t border-border pt-6'}>
      <Text className="text-[11px] uppercase tracking-[1.5px] text-foreground" weight="semibold">
        {label}
      </Text>
    </View>
  );
}

/** Type and id together: one record can be several entries (a Job starts and is signed off). */
function activityKey(item: { id: string; type: string }): string {
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
