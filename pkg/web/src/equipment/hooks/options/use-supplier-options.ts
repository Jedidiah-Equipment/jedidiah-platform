import type { SupplierListInput } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { toSelectOptions } from './helpers.js';

type UseSupplierOptionsOptions = {
  enabled?: boolean;
  limit?: number;
};

const defaultSupplierListInput = {
  columnFilters: {},
  cursor: 0,
  search: '',
  sortBy: 'companyName',
  sortDirection: 'asc',
} as const satisfies Omit<SupplierListInput, 'limit'>;

export function useSupplierOptions({ enabled = true, limit = 20 }: UseSupplierOptionsOptions = {}) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.suppliers.list.queryOptions(
      {
        ...defaultSupplierListInput,
        limit,
      },
      { enabled },
    ),
  );
  const items = query.data?.items ?? [];
  const selectOptions = useMemo(() => toSelectOptions(items, (supplier) => supplier.companyName), [items]);

  return {
    items,
    query,
    selectOptions,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
