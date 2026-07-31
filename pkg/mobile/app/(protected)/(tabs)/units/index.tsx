import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';
import { UnitCatalogControls, UnitCatalogHeader, UnitList, UnitListSkeleton } from '@/components/units/UnitCatalog';
import { isNearVerticalScrollEnd } from '@/lib/scroll-pagination';
import { useTRPC } from '@/lib/trpc';
import {
  getUnitListPresentation,
  isUnitBuildStateFilter,
  isUnitSort,
  type UnitBuildStateFilter,
  type UnitSort,
} from '@/lib/unit-presentation';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';

const UNIT_BATCH_SIZE = 20;

/** Read-only Product Unit list. The units layout owns the permission gate. */
export default function UnitsRoute() {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const [buildState, setBuildState] = usePersistedState<UnitBuildStateFilter>(
    'jedidiah-unit-build-state',
    'all',
    isUnitBuildStateFilter,
  );
  const [sort, setSort] = usePersistedState<UnitSort>('jedidiah-unit-sort', 'serial', isUnitSort);
  const refresh = useGlobalRefresh();
  const units = useInfiniteQuery(
    trpc.productUnits.list.infiniteQueryOptions(
      {
        ...getUnitListPresentation(buildState, sort),
        limit: UNIT_BATCH_SIZE,
        search: debouncedSearch || undefined,
      },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        // Keep the list and mounted search box steady while new criteria load.
        placeholderData: keepPreviousData,
      },
    ),
  );
  const unitItems = useMemo(() => units.data?.pages.flatMap((page) => page.items) ?? [], [units.data?.pages]);
  const total = units.data?.pages.at(-1)?.total ?? null;
  const hasCriteria = search.trim().length > 0 || buildState !== 'all';
  const loadNextPage = useCallback(() => {
    if (units.hasNextPage && !units.isFetchingNextPage) void units.fetchNextPage();
  }, [units.fetchNextPage, units.hasNextPage, units.isFetchingNextPage]);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isNearVerticalScrollEnd(event.nativeEvent)) loadNextPage();
    },
    [loadNextPage],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-[1180px] gap-5 px-4 pb-8 pt-4"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        refreshControl={<RefreshControl {...refresh} />}
        scrollEventThrottle={100}
      >
        <UnitCatalogHeader count={units.isPending ? null : total} />
        <View className="gap-4">
          <UnitCatalogControls
            buildState={buildState}
            onBuildStateChange={setBuildState}
            onSearchChange={setSearch}
            onSortChange={setSort}
            search={search}
            sort={sort}
          />

          {units.isPending ? (
            <UnitListSkeleton />
          ) : units.isError ? (
            <CatalogMessage detail="Pull to retry, or check your connection." title="Couldn’t load units." />
          ) : unitItems.length === 0 ? (
            <CatalogMessage
              detail={
                hasCriteria ? 'Try a different search or build state.' : 'Units appear once a Build Job creates them.'
              }
              title={hasCriteria ? 'No units match' : 'No units yet'}
            />
          ) : (
            <View className="gap-4">
              <UnitList units={unitItems} />
              {units.isFetchingNextPage ? (
                <Text className="text-center text-sm text-muted-foreground">Loading more units…</Text>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CatalogMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <View>
      <Text className="text-sm text-foreground" weight="semibold">
        {title}
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">{detail}</Text>
    </View>
  );
}
