import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { useTRPC } from '@/lib/trpc.js';

const QUOTE_INVENTORY_PART_PAGE_SIZE = 20;
const QUOTE_INVENTORY_PART_SEARCH_DEBOUNCE_MS = 250;

/** The Parts catalog, searched on the server a page at a time, as a Quote editor may read it: sell prices only. */
export function useQuoteInventoryPartOptions({ enabled }: { enabled: boolean }) {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, QUOTE_INVENTORY_PART_SEARCH_DEBOUNCE_MS);
  const query = useInfiniteQuery(
    trpc.quotes.inventoryParts.infiniteQueryOptions(
      { limit: QUOTE_INVENTORY_PART_PAGE_SIZE, search: debouncedSearch },
      { ...cursorInfiniteQueryOptions, enabled, placeholderData: keepPreviousData },
    ),
  );
  const { items, total } = useCombinedCursorQueryPages(query.data?.pages);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  return {
    hasNextPage,
    isFetching: query.isFetching,
    isFetchingNextPage,
    items,
    loadMore: useCallback(() => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]),
    search,
    setSearch,
    total,
  };
}
