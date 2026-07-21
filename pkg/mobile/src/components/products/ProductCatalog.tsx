import { formatCurrency } from '@pkg/domain';
import type { Product, ProductRangeOption } from '@pkg/schema';
import { IconArrowsSort, IconFilter } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { BoardGrid } from '@/components/bays/BoardGrid';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { ProductImage } from '@/components/products/ProductImage';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import type { ProductSort, RangeFilter } from '@/lib/product-presentation';

const PRODUCT_SORT_OPTIONS: readonly ListControlOption<ProductSort>[] = [
  { label: 'Name', value: 'name' },
  { label: 'Price', value: 'price' },
];
const PRODUCT_SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export function ProductCatalogHeader({ count }: { count: number | null }) {
  return (
    <ScreenHeader
      subtitle={count === null ? 'Loading catalog…' : `${count} ${count === 1 ? 'product' : 'products'}`}
      title="Products"
    />
  );
}

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
          placeholder="Search products…"
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

export function ProductGrid({ products }: { products: readonly Product[] }) {
  if (products.length === 0) {
    return <Text className="text-sm text-muted-foreground">No Products match the current search and filter.</Text>;
  }

  return (
    <BoardGrid
      items={products}
      keyOf={(product) => product.id}
      minCardWidth={240}
      renderItem={(product) => <ProductCard product={product} />}
    />
  );
}

export function ProductGridSkeleton() {
  return (
    <BoardGrid
      items={PRODUCT_SKELETON_KEYS}
      keyOf={(key) => key}
      minCardWidth={240}
      renderItem={() => (
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          <Pulse className="h-[132px] w-full rounded-none" />
          <View className="gap-3 p-3.5">
            <Pulse className="h-5 w-3/4 rounded" />
            <Pulse className="h-5 w-1/2 rounded-full" />
            <Pulse className="h-6 w-2/3 rounded" />
          </View>
        </View>
      )}
    />
  );
}

function ProductCard({ product }: { product: Product }) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityHint="Opens Product details"
      accessibilityLabel={product.name}
      accessibilityRole="button"
      className="overflow-hidden rounded-2xl border border-border bg-surface active:opacity-80"
      onPress={() => router.push({ pathname: '/products/[productId]', params: { productId: product.id } })}
    >
      <View className="relative h-[132px] overflow-hidden bg-image-backdrop">
        <ProductImage product={product} />
        <View className="absolute left-2.5 top-2.5 rounded-lg border border-white/10 bg-black/70 px-2 py-1">
          <Text className="text-[10px] tracking-wide text-white" mono>
            {product.modelCode}
          </Text>
        </View>
      </View>

      <View className="p-3.5">
        <Text className="text-base leading-5 text-foreground" numberOfLines={2} weight="bold">
          {product.name}
        </Text>
        <View className="mt-3 min-h-6 flex-row flex-wrap items-center gap-2">
          {product.category ? (
            <View className="rounded-full border border-border bg-muted/50 px-2 py-1">
              <Text className="text-[10px] tracking-wide text-muted-foreground" mono>
                {product.category}
              </Text>
            </View>
          ) : null}
          <Text className="text-[10px] tracking-wide text-muted-foreground" mono>
            {product.range.name}
          </Text>
        </View>
        <View className="mt-3 flex-row items-baseline gap-2 border-t border-border pt-3">
          <Text className="text-[9px] tracking-widest text-muted-foreground" mono>
            BASE
          </Text>
          <Text className="text-[17px] text-primary" weight="bold">
            {formatCurrency(product.basePrice, product.currencyCode)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
