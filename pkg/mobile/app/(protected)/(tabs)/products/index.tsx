import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
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
import { useCan } from '@/lib/use-access';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';

export default function ProductsRoute() {
  const trpc = useTRPC();
  const access = useCan('product:read');
  const products = useQuery(trpc.products.list.queryOptions({ pageSize: 0 }, { enabled: access.can }));
  const rangeOptions = useQuery(trpc.products.rangeOptions.queryOptions(undefined, { enabled: access.can }));
  const [range, setRange] = usePersistedState<RangeFilter>('jedidiah-product-range', 'all', isRangeFilter);
  const [sort, setSort] = usePersistedState<ProductSort>('jedidiah-product-sort', 'name', isProductSort);
  const refresh = useGlobalRefresh();
  const ranges = rangeOptions.data?.ranges ?? [];
  const normalizedRange = rangeOptions.isSuccess
    ? normalizeRangeFilter(
        range,
        ranges.map((option) => option.id),
      )
    : range;
  const presentedProducts = presentProducts(products.data?.items ?? [], normalizedRange, sort);

  useEffect(() => {
    if (rangeOptions.isSuccess && normalizedRange !== range) setRange(normalizedRange);
  }, [normalizedRange, range, rangeOptions.isSuccess, setRange]);

  const pending = access.isPending || (access.can && (products.isPending || rangeOptions.isPending));
  const count = pending ? null : presentedProducts.length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-[1180px] gap-5 px-4 pb-8 pt-4"
        refreshControl={<RefreshControl {...refresh} />}
      >
        <ProductCatalogHeader count={count} />

        {pending ? (
          <ProductGridSkeleton />
        ) : !access.can ? (
          <CatalogMessage
            detail="Your account doesn’t have Product access. Ask an administrator to update your permissions."
            title="You don’t have access to Products."
          />
        ) : products.isError || rangeOptions.isError ? (
          <CatalogMessage
            detail="Pull to retry, or check your connection."
            title="Couldn’t load the Product catalog."
          />
        ) : (
          <View className="gap-4">
            <ProductCatalogControls
              onRangeChange={setRange}
              onSortChange={setSort}
              range={normalizedRange}
              ranges={ranges}
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
