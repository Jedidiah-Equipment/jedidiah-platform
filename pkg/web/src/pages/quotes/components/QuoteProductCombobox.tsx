import { useDebouncedValue } from '@mantine/hooks';
import type { Product, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { EntityCombobox, mergeSelectedOption } from './EntityCombobox.js';

export type QuoteProductOption = Pick<Product, 'basePrice' | 'currencyCode' | 'id' | 'modelCode' | 'name'>;

type QuoteProductComboboxProps = {
  disabled: boolean;
  onResolvedSelected?: (product: QuoteProductOption | null) => void;
  onSelected: (product: QuoteProductOption | null) => void;
  value: UUID | '';
};

export const QuoteProductCombobox: React.FC<QuoteProductComboboxProps> = ({
  disabled,
  onResolvedSelected,
  onSelected,
  value,
}) => {
  const trpc = useTRPC();
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
    if (value && !valueProduct) {
      return;
    }

    onResolvedSelected?.(valueProduct);
  }, [onResolvedSelected, value, valueProduct]);

  return (
    <EntityCombobox
      disabled={disabled}
      emptyMessage="No products found"
      inputId="product-id"
      inputValue={search}
      isFetching={productsQuery.isFetching || selectedProductQuery.isFetching}
      itemToLabel={(product) => product.name}
      onInputValueChange={setSearch}
      onSelected={(product) => {
        onSelected(product);
        setSearch('');
      }}
      options={options}
      placeholder="Search products"
      renderItem={(product) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{product.name}</span>
          <span className="truncate text-xs text-muted-foreground">{product.modelCode}</span>
        </span>
      )}
      searchPlaceholder="Searching products..."
      value={valueProduct}
    />
  );
};
