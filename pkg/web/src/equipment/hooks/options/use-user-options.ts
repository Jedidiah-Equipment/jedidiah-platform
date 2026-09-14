import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { toSelectOptions } from './helpers.js';

export function useUserOptions() {
  const trpc = useTRPC();
  // A picker names people rather than administers them, so it lists everyone — the audit trail's
  // actors include people who have since moved to the other business.
  const query = useQuery(trpc.users.list.queryOptions({}));
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
