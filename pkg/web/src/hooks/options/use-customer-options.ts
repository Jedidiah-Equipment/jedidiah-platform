import type { Customer, CustomerListInput, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { mergeSelectedOption, toSelectOptions } from './helpers.js';

export type CustomerOption = Pick<Customer, 'companyName' | 'email' | 'id'>;

type UseCustomerOptionsOptions = {
  fallbackCustomer?: CustomerOption | null;
  pageSize?: number;
  search?: string;
  value?: UUID | '';
};

const defaultCustomerListInput = {
  columnFilters: {},
  page: 1,
  search: '',
  sortBy: 'companyName',
  sortDirection: 'asc',
} as const satisfies Omit<CustomerListInput, 'pageSize'>;

export function useCustomerOptions({
  fallbackCustomer = null,
  pageSize = 20,
  search = '',
  value = '',
}: UseCustomerOptionsOptions = {}) {
  const trpc = useTRPC();
  const input = {
    ...defaultCustomerListInput,
    pageSize,
    search,
  };
  const customersQuery = useQuery(trpc.customers.list.queryOptions(input));
  const selectedCustomerQuery = useQuery({
    ...trpc.customers.list.queryOptions({
      ...defaultCustomerListInput,
      columnFilters: { id: value },
      pageSize: 1,
    }),
    enabled: Boolean(value),
  });
  const selectedItem = selectedCustomerQuery.data?.items.find((customer) => customer.id === value) ?? null;
  const items = customersQuery.data?.items ?? [];
  const itemsWithSelected = useMemo(
    () => mergeSelectedOption(items, selectedItem ?? fallbackCustomer),
    [fallbackCustomer, items, selectedItem],
  );
  const selectOptions = useMemo(
    () => toSelectOptions(itemsWithSelected, (customer) => customer.companyName),
    [itemsWithSelected],
  );

  return {
    items,
    itemsWithSelected,
    query: customersQuery,
    selectedItem,
    selectOptions,
    isFetching: customersQuery.isFetching || selectedCustomerQuery.isFetching,
    isLoading: customersQuery.isLoading || selectedCustomerQuery.isLoading,
    isPending: customersQuery.isPending || selectedCustomerQuery.isPending,
  };
}
