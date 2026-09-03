import { formatCurrency } from '@pkg/domain';
import type { Product, ProductRangeOption } from '@pkg/schema';
import { IconArrowsSort, IconFilter } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { Text } from '@/components/ui/text';
import { CatalogListCard } from '@/equipment/components/CatalogList';
import type { ProductSort, RangeFilter } from '@/equipment/lib/product-presentation';

const PRODUCT_SORT_OPTIONS: readonly ListControlOption<ProductSort>[] = [
  { label: 'Name', value: 'name' },
  { label: 'Price', value: 'price' },
];
export function ProductCatalogControls({
  ranges,
  range,
  search,
  sort,
  onRangeChange,
  onSearchChange,
  onSortChange,
}: {
  ranges: readonly ProductRangeOption[];
  range: RangeFilter;
  search: string;
  sort: ProductSort;
  onRangeChange: (range: RangeFilter) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: ProductSort) => void;
}) {
  const rangeOptions: readonly ListControlOption<RangeFilter>[] = [
    { label: 'All ranges', value: 'all' },
    ...ranges.map((option) => ({ label: option.name, value: option.id })),
  ];

  return (
    <ListControlRow
      leading={
        <ListSearchControl
          accessibilityLabel="Search products"
          onChangeText={onSearchChange}
          placeholder="Search by name, model code, or description…"
          value={search}
        />
      }
      trailing={
        <View className="flex-row items-center gap-2">
          <ListDropdownControl
            accessibilityLabel="Filter products by range"
            defaultValue="all"
            dismissLabel="Dismiss Product Range filter"
            icon={IconFilter}
            menuWidth={240}
            onChange={onRangeChange}
            options={rangeOptions}
            value={range}
          />
          <ListDropdownControl
            accessibilityLabel="Sort products"
            defaultValue="name"
            dismissLabel="Dismiss Product sort"
            icon={IconArrowsSort}
            onChange={onSortChange}
            options={PRODUCT_SORT_OPTIONS}
            value={sort}
          />
        </View>
      }
    />
  );
}

export function ProductCatalogCard({ product }: { product: Product }) {
  const router = useRouter();
  const rangeAndCategory = product.category ? `${product.range.name} · ${product.category}` : product.range.name;

  return (
    <CatalogListCard
      accessibilityHint="Opens Product details"
      accessibilityLabel={product.name}
      avatarName={product.name}
      avatarUri={product.thumbnailDataUrl}
      mainText={product.name}
      monoText={product.modelCode}
      onPress={() => router.push({ pathname: '/equipment/products/[productId]', params: { productId: product.id } })}
      subText={rangeAndCategory}
      trailing={
        <Text className="text-[15px] text-primary" numberOfLines={1} weight="bold">
          {formatCurrency(product.basePrice, product.currencyCode, { decimals: 0 })}
        </Text>
      }
    />
  );
}
