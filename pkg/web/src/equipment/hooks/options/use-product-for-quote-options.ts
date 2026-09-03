import type { ProductListInput, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { mergeSelectedOption, toSelectOptions } from './helpers.js';

type UseProductForQuoteOptionsOptions = {
  includeHistoricalSelected?: boolean;
  limit?: number;
  rangeId?: UUID | '';
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

export function useProductForQuoteOptions({
  includeHistoricalSelected = false,
  limit = 20,
  rangeId = '',
  search = '',
  value = '',
}: UseProductForQuoteOptionsOptions = {}) {
  const trpc = useTRPC();
  const rangeColumnFilter = rangeId ? { rangeId } : {};
  const input = {
    ...defaultProductListInput,
    columnFilters: rangeColumnFilter,
    limit,
    search,
  };
  const productsQuery = useQuery(trpc.quotes.products.queryOptions(input));
  const selectedActiveProductQuery = useQuery({
    ...trpc.quotes.products.queryOptions({
      ...defaultProductListInput,
      columnFilters: { id: value, ...rangeColumnFilter },
      limit: 1,
    }),
    enabled: Boolean(value) && !includeHistoricalSelected,
  });
  const selectedHistoricalProductQuery = useQuery({
    ...trpc.quotes.productOption.queryOptions({ id: value as UUID }),
    enabled: Boolean(value) && includeHistoricalSelected,
  });
  const selectedItem =
    (includeHistoricalSelected
      ? selectedHistoricalProductQuery.data
      : selectedActiveProductQuery.data?.items.find((product) => product.id === value)) ?? null;
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
    isFetching:
      productsQuery.isFetching || selectedActiveProductQuery.isFetching || selectedHistoricalProductQuery.isFetching,
    isLoading:
      productsQuery.isLoading || selectedActiveProductQuery.isLoading || selectedHistoricalProductQuery.isLoading,
    isPending:
      productsQuery.isPending || selectedActiveProductQuery.isPending || selectedHistoricalProductQuery.isPending,
    isResolvingSelected:
      Boolean(value) &&
      (includeHistoricalSelected ? selectedHistoricalProductQuery.isPending : selectedActiveProductQuery.isPending),
  };
}
