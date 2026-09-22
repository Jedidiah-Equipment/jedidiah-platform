import { useDebouncedValue } from '@mantine/hooks';
import type { JobStockMovementType } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { useTRPC } from '@/lib/trpc.js';

const QUOTE_OPTION_PAGE_SIZE = 20;
const QUOTE_OPTION_SEARCH_DEBOUNCE_MS = 250;

/** The Parts Sales a stock movement may target, read through inventory so a price-blind role can pick one. */
export function useInventoryQuotePicker({
  enabled,
  movementType,
}: {
  enabled: boolean;
  movementType: JobStockMovementType;
}) {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, QUOTE_OPTION_SEARCH_DEBOUNCE_MS);
  const query = useInfiniteQuery(
    trpc.inventory.quoteOptions.infiniteQueryOptions(
      { limit: QUOTE_OPTION_PAGE_SIZE, movementType, search: debouncedSearch },
      { ...cursorInfiniteQueryOptions, enabled, placeholderData: keepPreviousData },
    ),
  );
  const { items, total } = useCombinedCursorQueryPages(query.data?.pages);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  return {
    hasNextPage,
    isFetching: query.isFetching,
    isFetchingNextPage,
    isPending: query.isPending,
    items,
    loadMore: useCallback(() => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]),
    search,
    setSearch,
    total,
  };
}

export type InventoryQuotePickerController = ReturnType<typeof useInventoryQuotePicker>;
