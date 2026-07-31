import { formatDate } from '@pkg/domain';
import type { ProductUnitSummary } from '@pkg/schema';
import { IconArrowsSort, IconFilter } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BoardGrid } from '@/components/bays/BoardGrid';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { UnitBuildStateChip } from '@/components/units/UnitBuildStateChip';
import {
  UNIT_BUILD_STATE_OPTIONS,
  UNIT_SORT_OPTIONS,
  type UnitBuildStateFilter,
  type UnitSort,
} from '@/lib/unit-presentation';

// Narrower than the Product and Quote tiles: a Unit card is one row of text beside a small
// thumbnail, so it stays readable in more columns than a card built around an image.
const UNIT_CARD_MIN_WIDTH = 260;
const UNIT_SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const BUILD_STATE_OPTIONS: readonly ListControlOption<UnitBuildStateFilter>[] = UNIT_BUILD_STATE_OPTIONS;
const SORT_OPTIONS: readonly ListControlOption<UnitSort>[] = UNIT_SORT_OPTIONS;

export function UnitCatalogHeader({ count }: { count: number | null }) {
  return (
    <ScreenHeader
      subtitle={count === null ? 'Loading units…' : `${count} ${count === 1 ? 'unit' : 'units'}`}
      title="Units"
    />
  );
}

export function UnitCatalogControls({
  buildState,
  onBuildStateChange,
  onSearchChange,
  onSortChange,
  search,
  sort,
}: {
  buildState: UnitBuildStateFilter;
  onBuildStateChange: (buildState: UnitBuildStateFilter) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: UnitSort) => void;
  search: string;
  sort: UnitSort;
}) {
  return (
    <ListControlRow
      leading={
        <ListSearchControl
          accessibilityLabel="Search units"
          onChangeText={onSearchChange}
          placeholder="Search units…"
          value={search}
        />
      }
      trailing={
        <View className="flex-row items-center gap-2">
          <ListDropdownControl
            accessibilityLabel="Filter units by build state"
            defaultValue="all"
            dismissLabel="Dismiss Unit build state filter"
            icon={IconFilter}
            onChange={onBuildStateChange}
            options={BUILD_STATE_OPTIONS}
            value={buildState}
          />
          <ListDropdownControl
            accessibilityLabel="Sort units"
            defaultValue="serial"
            dismissLabel="Dismiss Unit sort"
            icon={IconArrowsSort}
            onChange={onSortChange}
            options={SORT_OPTIONS}
            value={sort}
          />
        </View>
      }
    />
  );
}

export function UnitList({ units }: { units: readonly ProductUnitSummary[] }) {
  return (
    <BoardGrid
      items={units}
      keyOf={(unit) => unit.id}
      minCardWidth={UNIT_CARD_MIN_WIDTH}
      renderItem={(unit) => <UnitCard unit={unit} />}
    />
  );
}

function UnitCard({ unit }: { unit: ProductUnitSummary }) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityHint="Opens Unit details"
      accessibilityLabel={`Unit ${unit.productSerialNumber}`}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3 active:opacity-80"
      onPress={() => router.push({ pathname: '/units/[unitId]', params: { unitId: unit.id } })}
    >
      <Avatar
        className="h-11 w-11 rounded-lg"
        name={unit.product.name}
        textClassName="text-[10px]"
        uri={unit.product.thumbnailDataUrl}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] leading-5 text-foreground" mono numberOfLines={1} weight="semibold">
          {unit.productSerialNumber}
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted-foreground" numberOfLines={1}>
          {unit.product.name}
        </Text>
        <Text className="mt-0.5 text-[10px] text-muted-foreground" mono numberOfLines={1}>
          {/* A Unit with no Owner is one we hold. */}
          {unit.owner?.companyName ?? 'Stock'} · {formatDate(unit.createdAt, 'd MMM yyyy')}
        </Text>
      </View>
      <UnitBuildStateChip buildState={unit.buildState} owner={unit.owner} />
    </Pressable>
  );
}

export function UnitListSkeleton() {
  return (
    <BoardGrid
      items={UNIT_SKELETON_KEYS}
      keyOf={(key) => key}
      minCardWidth={UNIT_CARD_MIN_WIDTH}
      renderItem={() => (
        <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3">
          <Pulse className="h-11 w-11 rounded-lg" />
          <View className="min-w-0 flex-1 gap-2">
            <Pulse className="h-4 w-28 rounded" />
            <Pulse className="h-3 w-3/4 rounded" />
          </View>
          <Pulse className="h-6 w-16 rounded-full" />
        </View>
      )}
    />
  );
}
