import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MainToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
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
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useIsOffline } from '@/lib/connectivity';
import { usePersistedState } from '@/lib/use-persisted-state';
import { CategoryIcon } from './CategoryIcon';
import { MachineCatalogControls } from './MachineCatalogControls';
import { readingStatuses } from './reading-status';

const CATEGORY_FILTER_KEY = contractingStorageKey('machines', 'category');
const SORT_KEY = contractingStorageKey('machines', 'sort');

export default function MachinesScreen() {
  const fleet = useFleet();
  const { items, error } = useReadingQueue();
  const offline = useIsOffline();
  const [search, setSearch] = useState('');
  const [savedCategory, setCategory] = usePersistedState(CATEGORY_FILTER_KEY, 'all', isMachineCategoryFilter);
  const [sort, setSort] = usePersistedState<MachineSort>(SORT_KEY, 'code', isMachineSort);
  const categories = getMachineCategories(fleet.data ?? []);
  const category = normalizeMachineCategory(
    savedCategory,
    categories.map((item) => item.value),
  );
  const machines = getVisibleMachines(fleet.data ?? [], { search, category, sort });
  const attention = items.filter((item) => item.attention).length;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Machines" subtitle="CONTRACTING" helpTopic="contractingMobileMachines" />
      <View className="gap-3 px-4 py-3">
        {offline ? (
          <Text className="text-sm text-muted-foreground">
            Offline · showing saved Machines. Captures stay on this phone until synced.
          </Text>
        ) : null}
        {attention > 0 ? (
          <Button
            title={`${readingStatuses.attention.label} (${attention}) · ${items.length - attention} ${readingStatuses.queued.label.toLowerCase()}`}
            onPress={() => router.push('/contracting/attention')}
          />
        ) : null}
        {error ? <Text className="text-danger">{error}</Text> : null}
        <MachineCatalogControls
          categories={categories}
          category={category}
          search={search}
          sort={sort}
          onCategoryChange={setCategory}
          onSearchChange={setSearch}
          onSortChange={setSort}
        />
      </View>
      <FlatList
        data={machines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 10 }}
        refreshing={!offline && fleet.isRefetching}
        onRefresh={() => {
          void fleet.refetch();
        }}
        ListEmptyComponent={
          <Text className="text-muted-foreground">
            {!fleet.canRead
              ? 'Your role cannot view field Machines.'
              : fleet.data
                ? 'No Machines match your search or Category filter.'
                : offline
                  ? 'Connect once to save the fleet on this phone.'
                  : fleet.isError
                    ? 'Unable to load Machines. Pull to retry.'
                    : 'Loading Machines…'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/contracting/machines/${item.id}`)}
            className="w-full gap-2 rounded-xl border border-border bg-surface p-4"
          >
            <View className="flex-row items-center gap-3">
              <CategoryIcon icon={item.categoryIcon} colour={item.categoryColour} size={20} />
              <Text className="text-lg text-foreground" weight="bold">
                {item.code}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              {item.make} {item.model} · {item.categoryName}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
