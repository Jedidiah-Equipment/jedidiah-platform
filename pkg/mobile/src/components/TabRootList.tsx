import { type ReactNode, useEffect, useRef } from 'react';
import { FlatList, View } from 'react-native';
import { ListHeader, ListRow } from '@/components/ListControls';
import { MAIN_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';

export type TabRootListSection<T> = {
  data: readonly T[];
  header?: ReactNode;
  key: string;
};

export type TabRootListPagination = {
  hasNextPage: boolean;
  loadingMore: boolean;
  loadingMoreLabel: string;
  onLoadMore: () => void;
};

/** Pages a tab root through an infinite query. */
export function infiniteQueryPagination(
  query: { fetchNextPage: () => Promise<unknown>; hasNextPage: boolean; isFetchingNextPage: boolean },
  loadingMoreLabel: string,
): TabRootListPagination {
  return {
    hasNextPage: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadingMoreLabel,
    onLoadMore: () => void query.fetchNextPage(),
  };
}

type TabRootListRow<T> =
  | { item: T; key: string; kind: 'item' }
  | { content: ReactNode; key: string; kind: 'section-header' }
  | { key: string; kind: 'section-separator' };

/**
 * Every tab root's list, shared by both businesses: its controls as the scrolling header, optional sections, the app's
 * pull to refresh, and — for a server-paged list — the next page loaded as the end comes into view.
 */
export function TabRootList<T>({
  emptyContent,
  header,
  initialLoading = false,
  keyOf,
  loadingContent,
  pagination,
  renderItem,
  sections,
}: {
  emptyContent: ReactNode;
  header?: ReactNode;
  initialLoading?: boolean;
  keyOf: (item: T) => string;
  loadingContent?: ReactNode;
  pagination?: TabRootListPagination;
  renderItem: (item: T) => ReactNode;
  sections: readonly TabRootListSection<T>[];
}) {
  const loadMoreRequestedRef = useRef(false);
  const loadingMore = pagination?.loadingMore ?? false;

  useEffect(() => {
    if (!loadingMore) loadMoreRequestedRef.current = false;
  }, [loadingMore]);

  const rows = sections
    .filter((section) => section.data.length > 0)
    .flatMap<TabRootListRow<T>>((section, sectionIndex) => [
      ...(sectionIndex === 0 ? [] : [{ key: `separator:${section.key}`, kind: 'section-separator' as const }]),
      ...(section.header === undefined
        ? []
        : [{ content: section.header, key: `section:${section.key}`, kind: 'section-header' as const }]),
      ...section.data.map((item) => ({
        item,
        key: `item:${section.key}:${keyOf(item)}`,
        kind: 'item' as const,
      })),
    ]);

  const loadMore = () => {
    if (!pagination?.hasNextPage || loadingMore || initialLoading || loadMoreRequestedRef.current) return;

    // FlatList can fire onEndReached repeatedly before the loading prop reaches this render.
    loadMoreRequestedRef.current = true;
    try {
      pagination.onLoadMore();
    } catch (error) {
      loadMoreRequestedRef.current = false;
      throw error;
    }
  };

  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={MAIN_PAGE_CONTENT_STYLE}
      data={rows}
      keyExtractor={(row) => row.key}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<View className="w-full">{initialLoading ? loadingContent : emptyContent}</View>}
      ListFooterComponent={
        loadingMore ? (
          <Text className="pb-1 pt-0.5 text-center text-sm text-muted-foreground">{pagination?.loadingMoreLabel}</Text>
        ) : null
      }
      ListHeaderComponent={header === undefined ? null : <ListHeader>{header}</ListHeader>}
      onEndReached={pagination ? loadMore : undefined}
      onEndReachedThreshold={0.35}
      refreshControl={<RefreshControl />}
      renderItem={({ item: row }) => {
        if (row.kind === 'section-separator') return <View className="h-2" />;
        if (row.kind === 'section-header') return <View className="mb-2.5 mt-1">{row.content}</View>;
        return <ListRow>{renderItem(row.item)}</ListRow>;
      }}
    />
  );
}
