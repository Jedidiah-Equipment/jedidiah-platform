import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ProductCatalogControls,
  ProductCatalogHeader,
  ProductGrid,
  ProductGridSkeleton,
} from '@/components/products/ProductCatalog';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';
import {
  isProductSort,
  isRangeFilter,
  normalizeRangeFilter,
  type ProductSort,
  presentProducts,
  type RangeFilter,
} from '@/lib/product-presentation';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';

/** Product catalog list. The products layout owns the permission gate. */
export default function ProductsRoute() {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  // keepPreviousData holds the grid (and the mounted search box) steady while a new search loads.
  const products = useQuery(
    trpc.products.list.queryOptions(
      { pageSize: 0, search: debouncedSearch || undefined },
      { placeholderData: keepPreviousData },
    ),
  );
  const rangeOptions = useQuery(trpc.products.rangeOptions.queryOptions(undefined));
  const [range, setRange] = usePersistedState<RangeFilter>('jedidiah-product-range', 'all', isRangeFilter);
  const [sort, setSort] = usePersistedState<ProductSort>('jedidiah-product-sort', 'name', isProductSort);
  const refresh = useGlobalRefresh();
  const ranges = rangeOptions.data?.ranges ?? [];
  // A persisted Range that no longer exists renders as "all"; storage self-heals the
  // next time the user picks a Range, so no write-back effect is needed.
  const normalizedRange = rangeOptions.isSuccess
    ? normalizeRangeFilter(
        range,
        ranges.map((option) => option.id),
      )
    : range;
  const presentedProducts = presentProducts(products.data?.items ?? [], normalizedRange, sort);

  const pending = products.isPending || rangeOptions.isPending;
  const count = pending ? null : presentedProducts.length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-[1180px] gap-5 px-4 pb-8 pt-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl {...refresh} />}
      >
        <ProductCatalogHeader count={count} />

        {pending ? (
          <ProductGridSkeleton />
        ) : products.isError || rangeOptions.isError ? (
          <CatalogMessage
            detail="Pull to retry, or check your connection."
            title="Couldn’t load the Product catalog."
          />
        ) : (
          <View className="gap-4">
            <ProductCatalogControls
              onRangeChange={setRange}
              onSearchChange={setSearch}
              onSortChange={setSort}
              range={normalizedRange}
              ranges={ranges}
              search={search}
              sort={sort}
            />
            <ProductGrid products={presentedProducts} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CatalogMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <View>
      <Text className="text-sm text-foreground" weight="semibold">
        {title}
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">{detail}</Text>
    </View>
  );
}
