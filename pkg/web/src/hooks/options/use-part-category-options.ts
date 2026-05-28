import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { stringsToSelectOptions } from './helpers.js';

export function usePartCategoryOptions() {
  const trpc = useTRPC();
  const query = useQuery(trpc.parts.categories.queryOptions());
  const items = query.data?.categories ?? [];
  const selectOptions = useMemo(() => stringsToSelectOptions(items), [items]);

  return {
    items,
    query,
    selectOptions,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
