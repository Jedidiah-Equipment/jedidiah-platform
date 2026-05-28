import type { ProductListInput, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { mergeSelectedOption, toSelectOptions } from './helpers.js';

type UseProductForQuoteOptionsOptions = {
  pageSize?: number;
  search?: string;
  value?: UUID | '';
};

const defaultProductListInput = {
  columnFilters: {},
  page: 1,
  search: '',
  sortBy: 'name',
  sortDirection: 'asc',
} as const satisfies Omit<ProductListInput, 'pageSize'>;

export function useProductForQuoteOptions({
  pageSize = 20,
  search = '',
  value = '',
}: UseProductForQuoteOptionsOptions = {}) {
  const trpc = useTRPC();
  const input = {
    ...defaultProductListInput,
    pageSize,
    search,
  };
  const productsQuery = useQuery(trpc.quotes.products.queryOptions(input));
  const selectedProductQuery = useQuery({
    ...trpc.quotes.products.queryOptions({
      ...defaultProductListInput,
      columnFilters: { id: value },
      pageSize: 1,
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
