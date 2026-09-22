import { useDebouncedValue } from '@mantine/hooks';
import {
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';

const CURSOR_OPTION_SEARCH_DEBOUNCE_MS = 250;

type CursorPage<TItem> = { items: TItem[]; nextCursor: number | null; total: number };

/**
 * A server-searched combobox's controller: the typed search, debounced into the query the caller
 * builds from it, and the cursor pages it returns flattened into one option list.
 */
export function useCursorOptions<TItem, TError, TQueryKey extends QueryKey, TPageParam>(
  makeInfiniteQueryOptions: (
    search: string,
  ) => UseInfiniteQueryOptions<
    CursorPage<TItem>,
    TError,
    InfiniteData<CursorPage<TItem>, TPageParam>,
    TQueryKey,
    TPageParam
  >,
) {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, CURSOR_OPTION_SEARCH_DEBOUNCE_MS);
  const query = useInfiniteQuery(makeInfiniteQueryOptions(debouncedSearch));
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
