import { useDebouncedValue } from '@mantine/hooks';
import type { Product, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { EntityCombobox, mergeSelectedOption } from './EntityCombobox.js';

export type QuoteProductChoice = Pick<Product, 'basePrice' | 'currencyCode' | 'id' | 'modelCode' | 'name'>;

const getProductLabel = (product: QuoteProductChoice) => product.name;

const renderProductComboboxItem = (product: QuoteProductChoice) => (
  <span className="flex min-w-0 flex-col">
    <span className="truncate">{product.name}</span>
    <span className="truncate text-xs text-muted-foreground">{product.modelCode}</span>
  </span>
);

type QuoteProductComboboxProps = {
  disabled: boolean;
  notifyResolvedSelection?: boolean;
  onSelected: (product: QuoteProductChoice | null) => void;
  value: UUID | '';
};

export const QuoteProductCombobox: React.FC<QuoteProductComboboxProps> = ({
  disabled,
  notifyResolvedSelection = true,
  onSelected,
  value,
}) => {
  const trpc = useTRPC();
  const onSelectedRef = useRef(onSelected);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const productsQuery = useQuery(
    trpc.quotes.products.queryOptions({
      columnFilters: {},
      page: 1,
      pageSize: 20,
      search: debouncedSearch,
      sortBy: 'name',
      sortDirection: 'asc',
    }),
  );
  const selectedProductQuery = useQuery({
    ...trpc.quotes.products.queryOptions({
      columnFilters: {
        id: value,
      },
      page: 1,
      pageSize: 1,
      search: '',
      sortBy: 'name',
      sortDirection: 'asc',
    }),
    enabled: Boolean(value),
  });
  const selectedProduct = selectedProductQuery.data?.items.find((product) => product.id === value) ?? null;
  const options = useMemo(
    () => mergeSelectedOption(productsQuery.data?.items ?? [], selectedProduct),
    [productsQuery.data?.items, selectedProduct],
  );
  const valueProduct = options.find((product) => product.id === value) ?? null;

  useEffect(() => {
    onSelectedRef.current = onSelected;
  }, [onSelected]);

  useEffect(() => {
    if (!notifyResolvedSelection) {
      return;
    }

    if (value && !valueProduct) {
      return;
    }

    onSelectedRef.current(valueProduct);
  }, [notifyResolvedSelection, value, valueProduct]);

  return (
    <EntityCombobox
      disabled={disabled}
      emptyMessage="No products found"
      inputId="product-id"
      inputValue={search}
      isFetching={productsQuery.isFetching || selectedProductQuery.isFetching}
      itemToLabel={getProductLabel}
      onInputValueChange={setSearch}
      onSelected={(product) => {
        onSelected(product);
        setSearch('');
      }}
      options={options}
      placeholder="Search products"
      renderItem={renderProductComboboxItem}
      searchPlaceholder="Searching products..."
      value={valueProduct}
    />
  );
};
