import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { infiniteQueryPagination, TabRootList } from '@/components/TabRootList';
import { Text } from '@/components/ui/text';
import { CatalogListSkeleton } from '@/equipment/components/CatalogList';
import { MainTabToolbar } from '@/equipment/components/TopToolbar';
import { UnitCatalogCard, UnitCatalogControls } from '@/equipment/components/units/UnitCatalog';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import {
  getUnitListPresentation,
  isUnitBuildStateFilter,
  isUnitSort,
  type UnitBuildStateFilter,
  type UnitSort,
} from '@/equipment/lib/unit-presentation';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
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
  const emptyContent = units.isError ? (
    <CatalogMessage detail="Pull to retry, or check your connection." title="Couldn’t load units." />
  ) : (
    <CatalogMessage
      detail={hasCriteria ? 'Try a different search or build state.' : 'Units appear once a Build Job creates them.'}
      title={hasCriteria ? 'No units match' : 'No units yet'}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar
        assistantParent={MAIN_TAB_PARENTS.units}
        helpTopic="units"
        subtitle={total === null ? 'Loading units…' : `${total} ${total === 1 ? 'unit' : 'units'}`}
        title="Units"
      />
      <TabRootList
        emptyContent={emptyContent}
        header={
          <UnitCatalogControls
            buildState={buildState}
            onBuildStateChange={setBuildState}
            onSearchChange={setSearch}
            onSortChange={setSort}
            search={search}
            sort={sort}
          />
        }
        initialLoading={units.isPending}
        keyOf={(unit) => unit.id}
        loadingContent={<CatalogListSkeleton />}
        pagination={infiniteQueryPagination(units, 'Loading more units…')}
        renderItem={(unit) => <UnitCatalogCard unit={unit} />}
        sections={[{ data: unitItems, key: 'units' }]}
      />
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
