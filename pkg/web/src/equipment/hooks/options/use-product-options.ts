import type { Product, ProductListInput, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { mergeSelectedOption, toSelectOptions } from './helpers.js';

export type ProductOption = Pick<Product, 'assemblies' | 'basePrice' | 'currencyCode' | 'id' | 'modelCode' | 'name'>;

type UseProductOptionsOptions = {
  limit?: number;
  search?: string;
  value?: UUID | '';
};

const defaultProductListInput = {
  columnFilters: {},
  cursor: 0,
  search: '',
  sortBy: 'name',
  sortDirection: 'asc',
} as const satisfies Omit<ProductListInput, 'limit'>;

export function useProductOptions({ limit = 20, search = '', value = '' }: UseProductOptionsOptions = {}) {
  const trpc = useTRPC();
  const input = {
    ...defaultProductListInput,
    limit,
    search,
  };
  const productsQuery = useQuery(trpc.products.list.queryOptions(input));
  const selectedProductQuery = useQuery({
    ...trpc.products.list.queryOptions({
      ...defaultProductListInput,
      columnFilters: { id: value },
      limit: 1,
    }),
    enabled: Boolean(value),
  });
  const selectedItem = selectedProductQuery.data?.items.find((product) => product.id === value) ?? null;
  const items = productsQuery.data?.items ?? [];
  const itemsWithSelected = useMemo(() => mergeSelectedOption(items, selectedItem), [items, selectedItem]);
  const selectOptions = useMemo(
    () => toSelectOptions(itemsWithSelected, (product) => product.name),
    [itemsWithSelected],
  );

  return {
    items,
    itemsWithSelected,
    query: productsQuery,
    selectedItem,
    selectOptions,
    isFetching: productsQuery.isFetching || selectedProductQuery.isFetching,
    isLoading: productsQuery.isLoading || selectedProductQuery.isLoading,
    isPending: productsQuery.isPending || selectedProductQuery.isPending,
  };
}
