import { formatDate } from '@pkg/domain';
import type { ProductUnitSummary } from '@pkg/schema';
import { IconArrowsSort, IconFilter } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { CatalogListCard } from '@/components/CatalogList';
import { ListControlRow, ListDropdownControl, ListSearchControl } from '@/components/ListControls';
import { UnitBuildStateChip } from '@/components/units/UnitBuildStateChip';
import {
  UNIT_BUILD_STATE_OPTIONS,
  UNIT_SORT_OPTIONS,
  type UnitBuildStateFilter,
  type UnitSort,
} from '@/lib/unit-presentation';

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
          placeholder="Search by serial, VIN, owner, or product…"
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
            options={UNIT_BUILD_STATE_OPTIONS}
            value={buildState}
          />
          <ListDropdownControl
            accessibilityLabel="Sort units"
            defaultValue="serial"
            dismissLabel="Dismiss Unit sort"
            icon={IconArrowsSort}
            onChange={onSortChange}
            options={UNIT_SORT_OPTIONS}
            value={sort}
          />
        </View>
      }
    />
  );
}

export function UnitCatalogCard({ unit }: { unit: ProductUnitSummary }) {
  const router = useRouter();
  // A null Owner is the domain's representation for a Unit we still hold.
  const ownerName = unit.owner?.companyName ?? 'Stock';

  return (
    <CatalogListCard
      accessibilityHint="Opens Unit details"
      accessibilityLabel={`Unit ${unit.productSerialNumber}`}
      avatarName={unit.product.name}
      avatarUri={unit.product.thumbnailDataUrl}
      mainText={unit.productSerialNumber}
      monoText={`${ownerName} · ${formatDate(unit.createdAt, 'd MMM yyyy')}`}
      onPress={() => router.push({ pathname: '/units/[unitId]', params: { unitId: unit.id } })}
      subText={unit.product.name}
      trailing={<UnitBuildStateChip buildState={unit.buildState} owner={unit.owner} />}
    />
  );
}
