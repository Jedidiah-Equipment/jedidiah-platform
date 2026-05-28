import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { toSelectOptions } from './helpers.js';

export function useUserOptions() {
  const trpc = useTRPC();
  const query = useQuery(trpc.users.list.queryOptions());
  const items = query.data?.users ?? [];
  const selectOptions = useMemo(() => toSelectOptions(items, (user) => user.name), [items]);

  return {
    items,
    query,
    selectOptions,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
