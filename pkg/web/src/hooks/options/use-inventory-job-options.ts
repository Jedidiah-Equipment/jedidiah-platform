import type { InventoryJobOption, JobStockMovementType } from '@pkg/schema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { useTRPC } from '@/lib/trpc.js';

const JOB_OPTION_PAGE_SIZE = 20;

/**
 * The chosen Job, kept visible when the current page does not contain it. It is pinned ahead of the
 * page rather than after it — `mergeSelectedOption`'s placement — because the combobox tracks its
 * highlight by position: appended behind the page, loading the next page would slide it down the
 * list and leave the highlight on a different Job than the reader had arrowed onto.
 */
export function withSelectedJobPinnedFirst(
  items: readonly InventoryJobOption[],
  selected: InventoryJobOption | null,
): InventoryJobOption[] {
  if (!selected || items.some((item) => item.id === selected.id)) return [...items];

  return [selected, ...items];
}

/**
 * The Job a stock movement is posted against. Paged rather than capped at one page: the
 * return-to-store list spans every Job, so a fixed first page would silently strand the rest.
 */
export function useInventoryJobOptions({
  enabled = true,
  movementType,
  search,
  selected = null,
}: {
  enabled?: boolean;
  movementType: JobStockMovementType;
  search: string;
  selected?: InventoryJobOption | null;
}) {
  const trpc = useTRPC();
  const query = useInfiniteQuery(
    trpc.inventory.jobOptions.infiniteQueryOptions(
      { limit: JOB_OPTION_PAGE_SIZE, movementType, search },
      { ...cursorInfiniteQueryOptions, enabled, placeholderData: keepPreviousData },
    ),
  );
  const { items, total } = useCombinedCursorQueryPages(query.data?.pages);
  const options = useMemo(() => withSelectedJobPinnedFirst(items, selected), [items, selected]);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const onLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    isFetching: query.isFetching,
    options,
    pagination: { hasNextPage, isFetchingNextPage, loadedCount: items.length, onLoadMore, total },
  };
}
