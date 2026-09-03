import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CatalogListSkeleton, PaginatedCatalogList } from '@/components/CatalogList';
import { ProductCatalogCard, ProductCatalogControls } from '@/components/products/ProductCatalog';
import { MainTabToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import {
  getProductListPresentation,
  isProductSort,
  isRangeFilter,
  normalizeRangeFilter,
  type ProductSort,
  type RangeFilter,
} from '@/lib/product-presentation';
import { MAIN_TAB_PARENTS } from '@/lib/toolbar-navigation';
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
  const pending = rangeOptions.isPending || (rangeOptions.isSuccess && products.isPending);
  const failed = products.isError || rangeOptions.isError;
  const count = pending ? null : total;
  const emptyContent = failed ? (
    <CatalogMessage detail="Pull to retry, or check your connection." title="Couldn’t load the Product catalog." />
  ) : (
    <Text className="text-sm text-muted-foreground">No Products match the current search and filter.</Text>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar
        assistantParent={MAIN_TAB_PARENTS.products}
        helpTopic="products"
        subtitle={count === null ? 'Loading catalog…' : `${count} ${count === 1 ? 'product' : 'products'}`}
        title="Products"
      />
      <PaginatedCatalogList
        emptyContent={emptyContent}
        hasNextPage={products.hasNextPage}
        header={
          pending || failed ? undefined : (
            <ProductCatalogControls
              onRangeChange={setRange}
              onSearchChange={setSearch}
              onSortChange={setSort}
              range={normalizedRange}
              ranges={ranges}
              search={search}
              sort={sort}
            />
          )
        }
        initialLoading={pending}
        keyOf={(product) => product.id}
        loadingContent={<CatalogListSkeleton />}
        loadingMore={products.isFetchingNextPage}
        loadingMoreLabel="Loading more products…"
        onLoadMore={() => void products.fetchNextPage()}
        onRefresh={refresh.onRefresh}
        refreshing={refresh.refreshing}
        renderItem={(product) => <ProductCatalogCard product={product} />}
        sections={[{ data: productItems, key: 'products' }]}
      />
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
