import { groupBaysByDepartmentPipeline } from '@pkg/domain';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { PlanCatalogCard, PlanCatalogControls, PlanDepartmentHeader } from '@/equipment/components/bays/PlanCatalog';
import { CatalogListSkeleton, PaginatedCatalogList } from '@/equipment/components/CatalogList';
import { MainTabToolbar } from '@/equipment/components/TopToolbar';
import { type BaySort, filterBayCards, isBaySort, sortBayCards } from '@/equipment/lib/bay-sort';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useBayList } from '@/equipment/lib/use-bay-list';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';

/** Enabled Bays presented as the root Plan catalog. */
export default function PlanRoute() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = usePersistedState<BaySort>('jedidiah-bay-sort', 'days-left', isBaySort);
  const refresh = useGlobalRefresh();
  const { state } = useBayList();
  const bays = useMemo(
    () => (state.status === 'ready' ? sortBayCards(filterBayCards(state.cards, search), sort) : []),
    [search, sort, state],
  );
  const departments = useMemo(() => groupBaysByDepartmentPipeline(bays), [bays]);
  const total = state.status === 'ready' ? bays.length : null;
  const emptyContent =
    state.status === 'error' ? (
      <CatalogMessage detail="Pull to retry, or check your connection." title="Couldn’t load Plan." />
    ) : state.status === 'forbidden' ? (
      <CatalogMessage detail="Ask an administrator to update your permissions." title="You don’t have Job access." />
    ) : (
      <CatalogMessage
        detail={search.trim() ? 'Try a different Bay, operator, Job, Product, or Customer.' : 'No enabled Bays exist.'}
        title={search.trim() ? 'No Bays match' : 'No Bays yet'}
      />
    );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar
        assistantParent={MAIN_TAB_PARENTS.plan}
        helpTopic="plan"
        subtitle={total === null ? 'Loading Plan…' : `${total} ${total === 1 ? 'Bay' : 'Bays'}`}
        title="Plan"
      />
      <PaginatedCatalogList
        emptyContent={emptyContent}
        hasNextPage={false}
        header={<PlanCatalogControls onSearchChange={setSearch} onSortChange={setSort} search={search} sort={sort} />}
        initialLoading={state.status === 'pending'}
        keyOf={(bay) => bay.id}
        loadingContent={<CatalogListSkeleton />}
        loadingMore={false}
        loadingMoreLabel="Loading more Bays…"
        onLoadMore={() => undefined}
        onRefresh={refresh.onRefresh}
        refreshing={refresh.refreshing}
        renderItem={(bay) => <PlanCatalogCard bay={bay} />}
        sections={departments.map((group) => ({
          data: group.bays,
          header: <PlanDepartmentHeader department={group.department} />,
          key: group.department,
        }))}
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
