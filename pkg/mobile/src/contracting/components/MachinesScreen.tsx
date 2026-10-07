import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabRootList } from '@/components/TabRootList';
import { MainToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import {
  getMachineCategories,
  getVisibleMachines,
  isMachineCategoryFilter,
  isMachineSort,
  type MachineSort,
  normalizeMachineCategory,
} from '@/contracting/lib/machine-catalog';
import { useFleet } from '@/contracting/readings/use-fleet';
import { usePersistedState } from '@/lib/use-persisted-state';
import { CategoryIcon } from './CategoryIcon';
import { MachineCatalogControls } from './MachineCatalogControls';

const CATEGORY_FILTER_KEY = contractingStorageKey('machines', 'category');
const SORT_KEY = contractingStorageKey('machines', 'sort');

export default function MachinesScreen() {
  const fleet = useFleet();
  const [search, setSearch] = useState('');
  const [savedCategory, setCategory] = usePersistedState(CATEGORY_FILTER_KEY, 'all', isMachineCategoryFilter);
  const [sort, setSort] = usePersistedState<MachineSort>(SORT_KEY, 'code', isMachineSort);
  const categories = getMachineCategories(fleet.data ?? []);
  const category = normalizeMachineCategory(
    savedCategory,
    categories.map((item) => item.value),
  );
  const machines = getVisibleMachines(fleet.data ?? [], { search, category, sort });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Machines" subtitle="CONTRACTING" helpTopic="contractingMobileMachines" />
      <TabRootList
        header={
          <MachineCatalogControls
            categories={categories}
            category={category}
            search={search}
            sort={sort}
            onCategoryChange={setCategory}
            onSearchChange={setSearch}
            onSortChange={setSort}
          />
        }
        sections={[{ key: 'machines', data: machines }]}
        keyOf={(machine) => machine.id}
        renderItem={(machine) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/contracting/machines/${machine.id}`)}
            className="w-full gap-2 rounded-xl border border-border bg-surface p-4"
          >
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-row items-center gap-3">
                <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={20} />
                <Text className="text-lg text-foreground" weight="bold">
                  {machine.code}
                </Text>
              </View>
              <Text className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
                {machine.onSiteJobNumber ? `On Job · ${machine.onSiteJobNumber}` : 'In Yard'}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              {machine.make} {machine.model} · {machine.categoryName}
            </Text>
          </Pressable>
        )}
        initialLoading={fleet.canRead && !fleet.data && !fleet.isError}
        loadingContent={<Text className="text-muted-foreground">Loading Machines…</Text>}
        emptyContent={
          <Text className="text-muted-foreground">
            {!fleet.canRead
              ? 'Your role cannot view field Machines.'
              : fleet.isError && !fleet.data
                ? 'Unable to load Machines. Pull to retry.'
                : 'No Machines match your search or Category filter.'}
          </Text>
        }
      />
    </SafeAreaView>
  );
}
