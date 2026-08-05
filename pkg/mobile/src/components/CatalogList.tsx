import { type ReactNode, useEffect, useRef } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Pulse } from '@/components/ui/pulse';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
// The fixed frame prevents the loading list from shifting vertically when the real rows mount.
const CATALOG_CARD_FRAME_CLASS_NAME =
  'h-[76px] w-full flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3';

export function CatalogListCard({
  accessibilityHint,
  accessibilityLabel,
  avatarFallback,
  avatarName,
  avatarUri,
  mainText,
  monoText,
  onPress,
  subText,
  trailing,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  avatarFallback?: ReactNode;
  avatarName: string;
  avatarUri?: string | null;
  mainText: string;
  monoText?: string;
  onPress: () => void;
  subText: string;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={`${CATALOG_CARD_FRAME_CLASS_NAME} active:opacity-80`}
      onPress={onPress}
    >
      <Avatar
        className="h-11 w-11 shrink-0 rounded-lg"
        fallback={avatarFallback}
        name={avatarName}
        textClassName="text-[10px]"
        uri={avatarUri}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] leading-5 text-foreground" numberOfLines={1} weight="semibold">
          {mainText}
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted-foreground" numberOfLines={1}>
          {subText}
        </Text>
        {monoText === undefined ? null : (
          <Text className="mt-0.5 text-[10px] text-muted-foreground" mono numberOfLines={1}>
            {monoText}
          </Text>
        )}
      </View>
      {trailing === undefined ? null : <View className="shrink-0 items-end justify-center">{trailing}</View>}
    </Pressable>
  );
}

export type CatalogListSection<T> = {
  data: readonly T[];
  header?: ReactNode;
  key: string;
};

type CatalogListRow<T> =
  | { item: T; key: string; kind: 'item' }
  | { content: ReactNode; key: string; kind: 'section-header' }
  | { key: string; kind: 'section-separator' };

export function PaginatedCatalogList<T>({
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
  sections: readonly CatalogListSection<T>[];
}) {
  const loadMoreRequestedRef = useRef(false);

  useEffect(() => {
    if (!loadingMore) loadMoreRequestedRef.current = false;
  }, [loadingMore]);

  const rows = sections
    .filter((section) => section.data.length > 0)
    .flatMap<CatalogListRow<T>>((section, sectionIndex) => [
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
      contentContainerClassName="w-full px-4 pb-8 pt-4"
      data={rows}
      keyExtractor={(row) => row.key}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<View className="w-full">{initialLoading ? loadingContent : emptyContent}</View>}
      ListFooterComponent={
        loadingMore ? (
          <Text className="pb-1 pt-0.5 text-center text-sm text-muted-foreground">{loadingMoreLabel}</Text>
        ) : null
      }
      ListHeaderComponent={header === undefined ? null : <View className="mb-4">{header}</View>}
      onEndReached={loadMore}
      onEndReachedThreshold={0.35}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} />}
      renderItem={({ item: row }) => {
        if (row.kind === 'section-separator') return <View className="h-2" />;
        if (row.kind === 'section-header') return <View className="mb-2.5 mt-1">{row.content}</View>;
        return <View className="mb-3.5 w-full">{renderItem(row.item)}</View>;
      }}
    />
  );
}

export function CatalogListSkeleton({ trailing = true }: { trailing?: boolean }) {
  return (
    <View className="gap-3.5">
      {SKELETON_KEYS.map((key) => (
        <View className={CATALOG_CARD_FRAME_CLASS_NAME} key={key}>
          <Pulse className="h-11 w-11 rounded-lg" />
          <View className="min-w-0 flex-1 gap-1.5">
            <Pulse className="h-4 w-28 rounded" />
            <Pulse className="h-[10px] w-3/4 rounded" />
            <Pulse className="h-[10px] w-1/2 rounded" />
          </View>
          {trailing ? <Pulse className="h-8 w-20 rounded-lg" /> : null}
        </View>
      ))}
    </View>
  );
}
