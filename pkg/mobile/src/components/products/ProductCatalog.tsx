import { formatCurrency } from '@pkg/domain';
import type { Product, ProductRangeOption } from '@pkg/schema';
import { IconCheck } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BoardGrid } from '@/components/bays/BoardGrid';
import { ListControlRow, ListFilterButton, SegmentedSortControl } from '@/components/ListControls';
import { ProductImage } from '@/components/products/ProductImage';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Icon } from '@/components/ui/icon';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import type { ProductSort, RangeFilter } from '@/lib/product-presentation';

const PRODUCT_SORT_OPTIONS: readonly { label: string; value: ProductSort }[] = [
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
  const buttonRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; top: number } | null>(null);
  const rangeLabel =
    range === 'all' ? 'All ranges' : (ranges.find((option) => option.id === range)?.name ?? 'All ranges');

  const openMenu = () => {
    buttonRef.current?.measureInWindow((x, y, _width, height) => {
      setMenuAnchor({ left: x, top: y + height + 8 });
    });
  };

  const selectRange = (next: RangeFilter) => {
    onRangeChange(next);
    setMenuAnchor(null);
  };

  return (
    <ListControlRow
      leading={
        <View className="max-w-full self-start">
          <ListFilterButton
            accessibilityLabel="Filter by Product Range"
            active={range !== 'all'}
            expanded={menuAnchor !== null}
            label={rangeLabel}
            onPress={openMenu}
            ref={buttonRef}
          />

          {menuAnchor ? (
            <AnchoredMenu
              dismissLabel="Dismiss Range filter"
              onClose={() => setMenuAnchor(null)}
              style={{ left: menuAnchor.left, top: menuAnchor.top, width: 240 }}
            >
              <View className="p-1.5">
                <RangeOption active={range === 'all'} label="All ranges" onPress={() => selectRange('all')} />
                {ranges.map((option) => (
                  <RangeOption
                    key={option.id}
                    active={range === option.id}
                    label={option.name}
                    onPress={() => selectRange(option.id)}
                  />
                ))}
              </View>
            </AnchoredMenu>
          ) : null}
        </View>
      }
      trailing={<SegmentedSortControl onChange={onSortChange} options={PRODUCT_SORT_OPTIONS} value={sort} />}
    />
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
