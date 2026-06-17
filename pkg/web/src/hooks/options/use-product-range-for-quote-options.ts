import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { toSelectOptions } from './helpers.js';

export type { ProductRangeOption } from '@pkg/schema';

export function useProductRangeForQuoteOptions() {
  const trpc = useTRPC();
  const productRangesQuery = useQuery(trpc.quotes.rangeOptions.queryOptions());
  const items = productRangesQuery.data?.ranges ?? [];
  const selectOptions = useMemo(() => toSelectOptions(items, (range) => range.name), [items]);

  return {
    items,
    query: productRangesQuery,
    selectOptions,
    isFetching: productRangesQuery.isFetching,
    isLoading: productRangesQuery.isLoading,
    isPending: productRangesQuery.isPending,
  };
}
