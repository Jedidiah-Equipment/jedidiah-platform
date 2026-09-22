import type { InventoryQuoteOption, JobStockMovementType } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

import { StoresOptionPicker } from './StoresOptionPicker';

const QUOTE_PAGE_SIZE = 20;

/** The Parts Sale stock leaves for, or comes back from. Read through inventory, so it carries no price. */
export function QuotePicker({
  movementType,
  onSearchChange,
  onSelect,
  search,
  selected,
}: {
  movementType: JobStockMovementType;
  onSearchChange: (value: string) => void;
  onSelect: (quote: InventoryQuoteOption | null) => void;
  search: string;
  selected: InventoryQuoteOption | null;
}) {
  const trpc = useTRPC();
  const debouncedSearch = useDebouncedSearch(search);
  const quotes = useInfiniteQuery(
    trpc.inventoryQuotes.quoteOptions.infiniteQueryOptions(
      { limit: QUOTE_PAGE_SIZE, movementType, search: debouncedSearch },
      {
        enabled: selected === null,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = useMemo(() => quotes.data?.pages.flatMap((page) => page.items) ?? [], [quotes.data?.pages]);

  return (
    <StoresOptionPicker
      accessibilityLabel={(quote) => `${quote.code}, ${quote.customerCompanyName}`}
      changeHint="Choose a different Parts Sale"
      emptyMessage="No Parts Sales match."
      label="PARTS SALE"
      noun="Parts Sales"
      onSearchChange={onSearchChange}
      onSelect={onSelect}
      paging="button"
      query={{ ...quotes, items }}
      renderOption={(quote) => (
        <View className="gap-0.5">
          <Text className="text-base text-surface-foreground" mono weight="semibold">
            {quote.code}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {quote.customerCompanyName} · {quote.workTitle}
          </Text>
        </View>
      )}
      search={search}
      searchLabel="Search Parts Sales"
      searchPlaceholder="Search code, Customer, or work title"
      selected={selected}
    />
  );
}
