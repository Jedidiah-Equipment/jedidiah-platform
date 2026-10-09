import { formatHours } from '@pkg/domain';
import type { FieldMachine } from '@pkg/schema/contracting';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CatalogListCard } from '@/components/CatalogList';
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
import { useColorMode } from '@/theme/use-color-mode';
import { categoryTileProps } from './list-tiles';
import { MachineCatalogControls } from './MachineCatalogControls';

const CATEGORY_FILTER_KEY = contractingStorageKey('machines', 'category');
const SORT_KEY = contractingStorageKey('machines', 'sort');

/** Who the Machine is working for right now, stacked on the right; nothing when it is on no Job. */
function BusyWith({ machine }: { machine: FieldMachine }) {
  const job = machine.busyOnJob ?? null;
  // An API from before busyOnJob sends only the Job Number.
  if (!job && !machine.onSiteJobNumber) return null;
  return (
    <View className="max-w-36 items-end">
      <Text className="text-[10px] text-muted-foreground">Busy with</Text>
      <Text className="text-right text-[13px] text-foreground" weight="semibold" numberOfLines={1}>
        {job ? job.customerName : machine.onSiteJobNumber}
      </Text>
      {job ? (
        <Text className="text-right text-[11px] text-muted-foreground" numberOfLines={1}>
          {job.farmName}
        </Text>
      ) : null}
    </View>
  );
}

function MachineCard({ machine }: { machine: FieldMachine }) {
  const { resolved } = useColorMode();
  const tile = categoryTileProps(machine.categoryIcon, machine.categoryColour, resolved);
  return (
    <CatalogListCard
      accessibilityHint="Opens the Machine"
      accessibilityLabel={`Machine ${machine.code}`}
      avatarClassName={tile.className}
      avatarFallback={tile.fallback}
      avatarName={machine.code}
      mainText={machine.code}
      monoText={machine.latestReadingHours === null ? 'No reading' : formatHours(machine.latestReadingHours)}
      onPress={() => router.push(`/contracting/machines/${machine.id}`)}
      subText={`${machine.make} ${machine.model} · ${machine.categoryName}`}
      trailing={<BusyWith machine={machine} />}
    />
  );
}

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
        renderItem={(machine) => <MachineCard machine={machine} />}
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
