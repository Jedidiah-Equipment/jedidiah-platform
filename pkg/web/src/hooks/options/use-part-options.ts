import type { PartListInput } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { toSelectOptions } from './helpers.js';

type UsePartOptionsOptions = {
  pageSize?: number;
  sortBy?: PartListInput['sortBy'];
  sortDirection?: PartListInput['sortDirection'];
};

export function usePartOptions({ pageSize = 20, sortBy = 'name', sortDirection = 'asc' }: UsePartOptionsOptions = {}) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.parts.list.queryOptions({
      columnFilters: {},
      page: 1,
      pageSize,
      sortBy,
      sortDirection,
    }),
  );
  const items = query.data?.items ?? [];
  const selectOptions = useMemo(() => toSelectOptions(items, (part) => part.name), [items]);

  return {
    items,
    query,
    selectOptions,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
