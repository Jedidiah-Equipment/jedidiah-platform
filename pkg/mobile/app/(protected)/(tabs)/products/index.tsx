import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';
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
  getProductListPresentation,
  isProductSort,
  isRangeFilter,
  normalizeRangeFilter,
  type ProductSort,
  type RangeFilter,
} from '@/lib/product-presentation';
import { isNearVerticalScrollEnd } from '@/lib/scroll-pagination';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';

const PRODUCT_BATCH_SIZE = 20;

/** Product catalog list. The products layout owns the permission gate. */
export default function ProductsRoute() {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
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
  const presentation = getProductListPresentation(normalizedRange, sort);
  const products = useInfiniteQuery(
    trpc.products.list.infiniteQueryOptions(
      {
        ...presentation,
        limit: PRODUCT_BATCH_SIZE,
        search: debouncedSearch || undefined,
      },
      {
        enabled: rangeOptions.isSuccess,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        // Keep the grid and mounted search box steady while new criteria load.
        placeholderData: keepPreviousData,
      },
    ),
  );
  const productItems = useMemo(() => products.data?.pages.flatMap((page) => page.items) ?? [], [products.data?.pages]);
  const total = products.data?.pages.at(-1)?.total ?? null;
  const loadNextPage = useCallback(() => {
    if (products.hasNextPage && !products.isFetchingNextPage) void products.fetchNextPage();
  }, [products.fetchNextPage, products.hasNextPage, products.isFetchingNextPage]);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isNearVerticalScrollEnd(event.nativeEvent)) loadNextPage();
    },
    [loadNextPage],
  );

  const pending = rangeOptions.isPending || (rangeOptions.isSuccess && products.isPending);
  const count = pending ? null : total;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-[1180px] gap-5 px-4 pb-8 pt-4"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        refreshControl={<RefreshControl {...refresh} />}
        scrollEventThrottle={100}
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
            <ProductGrid products={productItems} />
            {products.isFetchingNextPage ? (
              <Text className="text-center text-sm text-muted-foreground">Loading more products…</Text>
            ) : null}
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
