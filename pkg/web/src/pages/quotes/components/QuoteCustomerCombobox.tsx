import { useDebouncedValue } from '@mantine/hooks';
import type { Customer, UUID } from '@pkg/schema';
import { PlusIcon } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';
import { useCustomerForQuoteOptions } from '@/hooks/options/index.js';

export type QuoteCustomerOption = Pick<Customer, 'companyName' | 'email' | 'id'>;
export type QuoteCustomerSelection =
  | {
      customer: QuoteCustomerOption;
      type: 'existing';
    }
  | {
      companyName: string;
      type: 'inline';
    };

type QuoteCustomerComboboxItem =
  | (QuoteCustomerOption & {
      type: 'existing';
    })
  | {
      companyName: string;
      email: null;
      id: string;
      type: 'inline';
    };

const getCustomerLabel = (customer: QuoteCustomerComboboxItem) => customer.companyName;

const getCustomerValue = (customer: QuoteCustomerComboboxItem) => customer.id;

type QuoteCustomerComboboxProps = {
  allowCreate?: boolean;
  disabled: boolean;
  fallbackCustomer?: QuoteCustomerOption | null;
  inlineValue?: string;
  mode?: 'existing' | 'inline';
  onSelected: (selection: QuoteCustomerSelection | null) => void;
  value: UUID | '';
};

export const QuoteCustomerCombobox: React.FC<QuoteCustomerComboboxProps> = ({
  allowCreate = true,
  disabled,
  fallbackCustomer = null,
  inlineValue = '',
  mode = 'existing',
  onSelected,
  value,
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const customers = useCustomerForQuoteOptions({
    fallbackCustomer,
    pageSize: 20,
    search: debouncedSearch,
    value,
  });
  const customerOptions = useMemo(
    () =>
      customers.itemsWithSelected.map((customer) => ({
        ...customer,
        type: 'existing' as const,
      })),
    [customers.itemsWithSelected],
  );
  const trimmedSearch = search.trim();
  const trimmedInlineValue = inlineValue.trim();
  const hasExactCustomer = customerOptions.some(
    (customer) => customer.companyName.toLowerCase() === trimmedSearch.toLowerCase(),
  );
  const createOption =
    allowCreate && trimmedSearch && !hasExactCustomer
      ? ({
          companyName: trimmedSearch,
          email: null,
          id: `inline:${trimmedSearch}`,
          type: 'inline',
        } satisfies QuoteCustomerComboboxItem)
      : null;
  const selectedInlineOption =
    mode === 'inline' && trimmedInlineValue
      ? ({
          companyName: trimmedInlineValue,
          email: null,
          id: `inline:${trimmedInlineValue}`,
          type: 'inline',
        } satisfies QuoteCustomerComboboxItem)
      : null;
  const options = [...customerOptions, ...(createOption ? [createOption] : [])];
  const valueCustomer =
    mode === 'inline' ? selectedInlineOption : (customerOptions.find((customer) => customer.id === value) ?? null);
  const selectedLabel = valueCustomer ? getCustomerLabel(valueCustomer) : '';
  const displayInputValue = search || selectedLabel;

  return (
    <Combobox
      disabled={disabled}
      filter={null}
      inputValue={displayInputValue}
      itemToStringLabel={getCustomerLabel}
      itemToStringValue={getCustomerValue}
      items={options}
      onInputValueChange={(nextInputValue, eventDetails) => {
        if (eventDetails.reason === 'item-press' || nextInputValue === displayInputValue) {
          return;
        }

        setSearch(nextInputValue);
      }}
      onValueChange={(customer) => {
        if (!customer) {
          onSelected(null);
          setSearch('');
          return;
        }

        onSelected(
          customer.type === 'inline'
            ? {
                companyName: customer.companyName,
                type: 'inline',
              }
            : {
                customer,
                type: 'existing',
              },
        );
        setSearch('');
      }}
      value={valueCustomer}
    >
      <ComboboxInput
        className="w-full"
        disabled={disabled}
        id="customer-id"
        placeholder={customers.isFetching ? 'Searching customers...' : 'Search or create customer'}
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>No customers found</ComboboxEmpty>
        <ComboboxList>
          {(customer: QuoteCustomerComboboxItem) => (
            <ComboboxItem key={customer.id} value={customer}>
              {customer.type === 'inline' ? (
                <>
                  <PlusIcon data-icon="inline-start" />
                  Use "{customer.companyName}"
                </>
              ) : (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{customer.companyName}</span>
                  {customer.email ? (
                    <span className="truncate text-xs text-muted-foreground">{customer.email}</span>
                  ) : null}
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};
