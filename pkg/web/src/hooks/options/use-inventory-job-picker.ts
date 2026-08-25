import { useDebouncedValue } from '@mantine/hooks';
import type { JobPickerTab, JobStockMovementType } from '@pkg/schema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import type { JobPickerController } from '@/components/job-picker/index.js';
import { JOB_PICKER_PAGE_SIZE } from '@/components/job-picker/index.js';
import { useTRPC } from '@/lib/trpc.js';

const JOB_SEARCH_DEBOUNCE_MS = 250;

/**
 * The Job a stock movement is posted against, read a page at a time. This is the one Job Picker that
 * cannot answer from a list the browser already holds: the stores role has no Job access to load one
 * with, and Return reaches every Job ever raised, so a fixed first page would strand the rest.
 *
 * Checkout opens on the Non-complete tab because that is the work stock is normally drawn for; the
 * other two tabs still reach completed Jobs, which stay eligible until close-out for late postings.
 */
export function useInventoryJobPicker({
  enabled = true,
  movementType,
}: {
  enabled?: boolean;
  movementType: JobStockMovementType;
}): JobPickerController {
  const trpc = useTRPC();
  const [activeTab, setActiveTab] = useState<JobPickerTab>(movementType === 'checkout' ? 'incomplete' : 'updated');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, JOB_SEARCH_DEBOUNCE_MS);
  const query = useInfiniteQuery(
    trpc.inventory.jobOptions.infiniteQueryOptions(
      { limit: JOB_PICKER_PAGE_SIZE, movementType, search: debouncedSearch, tab: activeTab },
      { ...cursorInfiniteQueryOptions, enabled, placeholderData: keepPreviousData },
    ),
  );
  const { items, total } = useCombinedCursorQueryPages(query.data?.pages);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  return {
    activeTab,
    error: query.error,
    hasMore: hasNextPage,
    isLoading: query.isPending,
    isLoadingMore: isFetchingNextPage,
    onLoadMore: useCallback(() => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]),
    onOpen: useCallback(() => setSearch(''), []),
    rows: items,
    search,
    setActiveTab,
    setSearch,
    total,
  };
}
