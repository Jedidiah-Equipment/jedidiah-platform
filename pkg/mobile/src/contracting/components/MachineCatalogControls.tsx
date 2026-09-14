import { IconArrowsSort, IconFilter } from '@tabler/icons-react-native';
import { View } from 'react-native';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import type { MachineSort } from '@/contracting/lib/machine-catalog';

const SORT_OPTIONS: readonly ListControlOption<MachineSort>[] = [
  { label: 'Machine Code', value: 'code' },
  { label: 'Category', value: 'category' },
];

export function MachineCatalogControls({
  categories,
  category,
  search,
  sort,
  onCategoryChange,
  onSearchChange,
  onSortChange,
}: {
  categories: readonly ListControlOption<string>[];
  category: string;
  search: string;
  sort: MachineSort;
  onCategoryChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: MachineSort) => void;
}) {
  return (
    <ListControlRow
      leading={
        <ListSearchControl
          accessibilityLabel="Search Machines"
          onChangeText={onSearchChange}
          placeholder="Search by code, make, or model…"
          value={search}
        />
      }
      trailing={
        <View className="flex-row items-center gap-2">
          <ListDropdownControl
            accessibilityLabel="Filter Machines by Category"
            defaultValue="all"
            dismissLabel="Dismiss Machine Category filter"
            icon={IconFilter}
            menuWidth={240}
            onChange={onCategoryChange}
            options={[{ label: 'All categories', value: 'all' }, ...categories]}
            value={category}
          />
          <ListDropdownControl
            accessibilityLabel="Sort Machines"
            defaultValue="code"
            dismissLabel="Dismiss Machine sort"
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
