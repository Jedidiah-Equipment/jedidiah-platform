import type { QuoteSummary } from '@pkg/schema/equipment';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  presentQuotePages,
  type QuoteSort,
  type QuoteStatusFilter,
  quoteSortDirection,
  shouldPinPriorityQuotes,
} from '@/equipment/lib/quote-presentation';
import { useTRPC } from '@/lib/trpc';

const PAGE_SIZE = 20;

export function useQuoteList({
  enabled,
  search,
  sort,
  status,
}: {
  enabled: boolean;
  search: string;
  sort: QuoteSort;
  status: QuoteStatusFilter;
}): {
  failed: boolean;
  hasNextPage: boolean;
  loadNextPage: () => void;
  loadingMore: boolean;
  mainQuotes: QuoteSummary[];
  pending: boolean;
  priorityQuotes: QuoteSummary[];
  total: number | null;
} {
  const trpc = useTRPC();
  const pinPriorityQuotes = shouldPinPriorityQuotes({ search, sort, status });
  const listQuery = useInfiniteQuery(
    trpc.quotes.list.infiniteQueryOptions(
      {
        filters: status === 'all' ? undefined : { statuses: [status] },
        limit: PAGE_SIZE,
        search: search || undefined,
        sortBy: 'createdAt',
        sortDirection: quoteSortDirection(sort),
      },
      {
        enabled,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
      },
    ),
  );
  const priorityQuery = useQuery(
    trpc.quotes.priorityList.queryOptions(undefined, { enabled: enabled && pinPriorityQuotes }),
  );
  const pages = listQuery.data?.pages ?? [];
  const sections = presentQuotePages(pages, pinPriorityQuotes ? (priorityQuery.data ?? []) : []);
  const loadNextPage = useCallback(() => {
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
  }, [listQuery.fetchNextPage, listQuery.hasNextPage, listQuery.isFetchingNextPage]);

  return {
    failed: (pinPriorityQuotes && priorityQuery.isError) || listQuery.isError,
    hasNextPage: listQuery.hasNextPage,
    loadNextPage,
    loadingMore: listQuery.isFetchingNextPage,
    mainQuotes: sections.mainQuotes,
    pending: (pinPriorityQuotes && priorityQuery.isPending) || listQuery.isPending,
    priorityQuotes: sections.priorityQuotes,
    total: pages.at(0)?.total ?? null,
  };
}
