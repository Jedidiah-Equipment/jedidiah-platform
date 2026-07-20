import { formatCurrency } from '@pkg/domain';
import type { Product, ProductRangeOption } from '@pkg/schema';
import { IconCheck, IconChevronDown, IconFilter, IconPackage } from '@tabler/icons-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { BoardGrid } from '@/components/bays/BoardGrid';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { ProductImage } from '@/components/products/ProductImage';
import { Icon } from '@/components/ui/icon';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import type { ProductSort, RangeFilter } from '@/lib/product-presentation';

const PRODUCT_SORT_OPTIONS: readonly { label: string; value: ProductSort }[] = [
  { label: 'NAME', value: 'name' },
  { label: 'PRICE', value: 'price' },
];
const PRODUCT_SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export function ProductCatalogHeader({ count }: { count: number | null }) {
  return (
    <View className="relative flex-row items-center gap-3">
      <View className="h-[42px] w-[42px] items-center justify-center rounded-xl border border-primary">
        <Icon className="text-primary" icon={IconPackage} size={22} strokeWidth={1.7} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-xl leading-6 text-foreground" weight="bold">
          Products
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted-foreground" mono>
          {count === null ? 'Loading catalog…' : `${count} ${count === 1 ? 'product' : 'products'}`}
        </Text>
      </View>
      <ProfileMenuButton />
    </View>
  );
}

export function ProductCatalogControls({
  ranges,
  range,
  sort,
  onRangeChange,
  onSortChange,
}: {
  ranges: readonly ProductRangeOption[];
  range: RangeFilter;
  sort: ProductSort;
  onRangeChange: (range: RangeFilter) => void;
  onSortChange: (sort: ProductSort) => void;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeLabel =
    range === 'all' ? 'ALL RANGES' : (ranges.find((option) => option.id === range)?.name ?? 'ALL RANGES');

  const selectRange = (next: RangeFilter) => {
    onRangeChange(next);
    setRangeOpen(false);
  };

  return (
    <View className="z-10 flex-row flex-wrap items-start justify-between gap-3">
      <View className="relative">
        <Pressable
          accessibilityLabel="Filter by Product Range"
          accessibilityRole="button"
          accessibilityState={{ expanded: rangeOpen }}
          className={`flex-row items-center gap-2 rounded-xl border px-3 py-2 ${
            range === 'all' ? 'border-border bg-surface' : 'border-primary bg-primary/10'
          }`}
          onPress={() => setRangeOpen((open) => !open)}
        >
          <Icon className={range === 'all' ? 'text-muted-foreground' : 'text-primary'} icon={IconFilter} size={15} />
          <Text
            className={`text-[11px] tracking-wide ${range === 'all' ? 'text-muted-foreground' : 'text-primary'}`}
            mono
            weight="semibold"
          >
            {rangeLabel}
          </Text>
          <Icon
            className={range === 'all' ? 'text-muted-foreground' : 'text-primary'}
            icon={IconChevronDown}
            size={13}
          />
        </Pressable>

        {rangeOpen ? (
          <View
            className="absolute left-0 top-12 z-50 w-[240px] rounded-2xl border border-border bg-elevated p-1.5"
            style={{ elevation: 12 }}
          >
            <RangeOption active={range === 'all'} label="All Ranges" onPress={() => selectRange('all')} />
            {ranges.map((option) => (
              <RangeOption
                key={option.id}
                active={range === option.id}
                label={option.name}
                onPress={() => selectRange(option.id)}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center gap-3">
        <Text className="text-[10px] tracking-widest text-muted-foreground" mono weight="semibold">
          SORT
        </Text>
        <View className="flex-row rounded-xl border border-border bg-surface p-1">
          {PRODUCT_SORT_OPTIONS.map((option) => {
            const selected = sort === option.value;

            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`rounded-lg border px-3 py-1.5 ${
                  selected ? 'border-border bg-elevated' : 'border-transparent'
                }`}
                onPress={() => onSortChange(option.value)}
              >
                <Text
                  className={`text-[11px] tracking-wider ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
                  mono
                  weight="semibold"
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function RangeOption({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="flex-row items-center justify-between gap-3 rounded-xl px-3 py-2.5 active:bg-muted"
      onPress={onPress}
    >
      <Text className={active ? 'text-primary' : 'text-foreground'} numberOfLines={1} weight="semibold">
        {label}
      </Text>
      {active ? <Icon className="text-primary" icon={IconCheck} size={15} /> : null}
    </Pressable>
  );
}

export function ProductGrid({ products }: { products: readonly Product[] }) {
  if (products.length === 0) {
    return <Text className="text-sm text-muted-foreground">No Products match this Range.</Text>;
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
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <View className="relative h-[132px] overflow-hidden bg-image-backdrop">
        <ProductImage product={product} />
        <View className="absolute left-2.5 top-2.5 rounded-lg border border-white/10 bg-black/70 px-2 py-1">
          <Text className="text-[10px] tracking-wide text-white" mono>
            {product.modelCode}
          </Text>
        </View>
      </View>

      <View className="p-3.5">
        <Text className="min-h-10 text-base leading-5 text-foreground" numberOfLines={2} weight="bold">
          {product.name}
        </Text>
        <View className="mt-2 min-h-6 flex-row flex-wrap items-center gap-2">
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
    </View>
  );
}
