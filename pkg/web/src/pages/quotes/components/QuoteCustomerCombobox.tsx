import { useDebouncedValue } from '@mantine/hooks';
import type { Customer, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { EntityCombobox, mergeSelectedOption } from './EntityCombobox.js';

export type QuoteCustomerOption = Pick<Customer, 'companyName' | 'email' | 'id'>;

const getCustomerLabel = (customer: QuoteCustomerOption) => customer.companyName;

const renderCustomerComboboxItem = (customer: QuoteCustomerOption) => (
  <span className="flex min-w-0 flex-col">
    <span className="truncate">{customer.companyName}</span>
    {customer.email ? <span className="truncate text-xs text-muted-foreground">{customer.email}</span> : null}
  </span>
);

type QuoteCustomerComboboxProps = {
  disabled: boolean;
  fallbackCustomer?: QuoteCustomerOption | null;
  onSelected: (customer: QuoteCustomerOption | null) => void;
  value: UUID | '';
};

export const QuoteCustomerCombobox: React.FC<QuoteCustomerComboboxProps> = ({
  disabled,
  fallbackCustomer = null,
  onSelected,
  value,
}) => {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const customersQuery = useQuery(
    trpc.quotes.customers.queryOptions({
      columnFilters: {},
      page: 1,
      pageSize: 20,
      search: debouncedSearch,
      sortBy: 'companyName',
      sortDirection: 'asc',
    }),
  );
  const selectedCustomerQuery = useQuery({
    ...trpc.quotes.customers.queryOptions({
      columnFilters: {
        id: value,
      },
      page: 1,
      pageSize: 1,
      search: '',
      sortBy: 'companyName',
      sortDirection: 'asc',
    }),
    enabled: Boolean(value),
  });
  const selectedCustomer = selectedCustomerQuery.data?.items.find((customer) => customer.id === value);
  const options = useMemo(
    () => mergeSelectedOption(customersQuery.data?.items ?? [], selectedCustomer ?? fallbackCustomer),
    [customersQuery.data?.items, fallbackCustomer, selectedCustomer],
  );
  const valueCustomer = options.find((customer) => customer.id === value) ?? null;

  return (
    <EntityCombobox
      disabled={disabled}
      emptyMessage="No customers found"
      inputId="customer-id"
      inputValue={search}
      isFetching={customersQuery.isFetching || selectedCustomerQuery.isFetching}
      itemToLabel={getCustomerLabel}
      onInputValueChange={setSearch}
      onSelected={(customer) => {
        onSelected(customer);
        setSearch('');
      }}
      options={options}
      placeholder="Search customers"
      renderItem={renderCustomerComboboxItem}
      searchPlaceholder="Searching customers..."
      value={valueCustomer}
    />
  );
};
