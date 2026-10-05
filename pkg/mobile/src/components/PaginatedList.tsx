import { type ReactNode, useEffect, useRef } from 'react';
import { FlatList, View } from 'react-native';
import { ListHeader, ListRow } from '@/components/ListControls';
import { MAIN_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';

/**
 * A tab root's server-paged list: its controls as the scrolling header, optional sections, pull to refresh, and the
 * next page loaded as the end comes into view. Shared by both businesses; Equipment names it `PaginatedCatalogList`.
 */
export type PaginatedListSection<T> = {
  data: readonly T[];
  header?: ReactNode;
  key: string;
};

type PaginatedListRow<T> =
  | { item: T; key: string; kind: 'item' }
  | { content: ReactNode; key: string; kind: 'section-header' }
  | { key: string; kind: 'section-separator' };

export function PaginatedList<T>({
  emptyContent,
  hasNextPage,
  header,
  initialLoading,
  keyOf,
  loadingContent,
  loadingMore,
  loadingMoreLabel,
  onLoadMore,
  onRefresh,
  refreshing,
  renderItem,
  sections,
}: {
  emptyContent: ReactNode;
  hasNextPage: boolean;
  header?: ReactNode;
  initialLoading: boolean;
  keyOf: (item: T) => string;
  loadingContent: ReactNode;
  loadingMore: boolean;
  loadingMoreLabel: string;
  onLoadMore: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  renderItem: (item: T) => ReactNode;
  sections: readonly PaginatedListSection<T>[];
}) {
  const loadMoreRequestedRef = useRef(false);

  useEffect(() => {
    if (!loadingMore) loadMoreRequestedRef.current = false;
  }, [loadingMore]);

  const rows = sections
    .filter((section) => section.data.length > 0)
    .flatMap<PaginatedListRow<T>>((section, sectionIndex) => [
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
    if (!hasNextPage || loadingMore || initialLoading || loadMoreRequestedRef.current) return;

    // FlatList can fire onEndReached repeatedly before the loading prop reaches this render.
    loadMoreRequestedRef.current = true;
    try {
      onLoadMore();
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
          <Text className="pb-1 pt-0.5 text-center text-sm text-muted-foreground">{loadingMoreLabel}</Text>
        ) : null
      }
      ListHeaderComponent={header === undefined ? null : <ListHeader>{header}</ListHeader>}
      onEndReached={loadMore}
      onEndReachedThreshold={0.35}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} />}
      renderItem={({ item: row }) => {
        if (row.kind === 'section-separator') return <View className="h-2" />;
        if (row.kind === 'section-header') return <View className="mb-2.5 mt-1">{row.content}</View>;
        return <ListRow>{renderItem(row.item)}</ListRow>;
      }}
    />
  );
}
