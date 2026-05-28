import { useDebouncedValue } from '@mantine/hooks';
import type { UUID } from '@pkg/schema';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { type ProductOption, useProductForQuoteOptions } from '@/hooks/options/index.js';
import { EntityCombobox } from './EntityCombobox.js';

export type QuoteProductChoice = ProductOption;

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
  const onSelectedRef = useRef(onSelected);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const products = useProductForQuoteOptions({
    pageSize: 20,
    search: debouncedSearch,
    value,
  });
  const valueProduct = products.itemsWithSelected.find((product) => product.id === value) ?? null;

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
      isFetching={products.isFetching}
      itemToLabel={getProductLabel}
      onInputValueChange={setSearch}
      onSelected={(product) => {
        onSelected(product);
        setSearch('');
      }}
      options={products.itemsWithSelected}
      placeholder="Search products"
      renderItem={renderProductComboboxItem}
      searchPlaceholder="Searching products..."
      value={valueProduct}
    />
  );
};
