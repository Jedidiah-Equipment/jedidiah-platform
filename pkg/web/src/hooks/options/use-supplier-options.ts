import type { SupplierListInput } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { toSelectOptions } from './helpers.js';

type UseSupplierOptionsOptions = {
  enabled?: boolean;
  pageSize?: number;
};

const defaultSupplierListInput = {
  columnFilters: {},
  page: 1,
  search: '',
  sortBy: 'companyName',
  sortDirection: 'asc',
} as const satisfies Omit<SupplierListInput, 'pageSize'>;

export function useSupplierOptions({ enabled = true, pageSize = 20 }: UseSupplierOptionsOptions = {}) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.suppliers.list.queryOptions(
      {
        ...defaultSupplierListInput,
        pageSize,
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
