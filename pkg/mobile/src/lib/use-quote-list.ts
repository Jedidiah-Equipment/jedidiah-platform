import type { QuoteSummary } from '@pkg/schema';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getNextQuotePage,
  presentQuotePages,
  type QuoteStatusFilter,
  shouldPinPriorityQuotes,
} from '@/lib/quote-presentation';
import { useTRPC } from '@/lib/trpc';

const PAGE_SIZE = 20;

type PaginationState = { search: string; status: QuoteStatusFilter; pageCount: number };

/**
 * Numbered-page infinite list over `quotes.list` (the endpoint is page-based, so
 * `useInfiniteQuery`'s cursor contract does not apply), with priority quotes pinned on the
 * unfiltered view. Pagination resets whenever the search or status criteria change.
 */
export function useQuoteList({
  enabled,
  search,
  status,
}: {
  enabled: boolean;
  search: string;
  status: QuoteStatusFilter;
}): {
  failed: boolean;
  loadNextPage: () => void;
  loadingMore: boolean;
  mainQuotes: QuoteSummary[];
  pending: boolean;
  priorityQuotes: QuoteSummary[];
  total: number | null;
} {
  const trpc = useTRPC();
  const [pagination, setPagination] = useState<PaginationState>({ search, status, pageCount: 1 });
  const loadingNextPage = useRef(false);
  const paginationMatchesQuery = pagination.search === search && pagination.status === status;
  const activePageCount = paginationMatchesQuery ? pagination.pageCount : 1;
  const pinPriorityQuotes = shouldPinPriorityQuotes({ search, status });

  useEffect(() => {
    setPagination({ search, status, pageCount: 1 });
    loadingNextPage.current = false;
  }, [search, status]);

  const pageNumbers = useMemo(
    () => Array.from({ length: activePageCount }, (_, index) => index + 1),
    [activePageCount],
  );
  const listQueries = useQueries({
    queries: pageNumbers.map((page) =>
      trpc.quotes.list.queryOptions(
        {
          filters: status === 'all' ? undefined : { statuses: [status] },
          page,
          pageSize: PAGE_SIZE,
          search: search || undefined,
          sortBy: 'createdAt',
          sortDirection: 'desc',
        },
        { enabled },
      ),
    ),
  });
  const priorityQuery = useQuery(
    trpc.quotes.priorityList.queryOptions(undefined, { enabled: enabled && pinPriorityQuotes }),
  );
  const loadedPages = listQueries.flatMap((query) => (query.data ? [query.data] : []));
  const sections = presentQuotePages(loadedPages, pinPriorityQuotes ? (priorityQuery.data ?? []) : []);
  const lastPage = loadedPages.at(-1);
  const nextPage = lastPage ? getNextQuotePage(lastPage, loadedPages) : undefined;
  const lastQuery = listQueries.at(-1);

  useEffect(() => {
    if (!lastQuery?.isPending) loadingNextPage.current = false;
  }, [lastQuery?.isPending]);

  const loadNextPage = useCallback(() => {
    if (nextPage === undefined || loadingNextPage.current) return;

    loadingNextPage.current = true;
    setPagination({ search, status, pageCount: nextPage });
  }, [nextPage, search, status]);

  return {
    failed: (pinPriorityQuotes && priorityQuery.isError) || listQueries.some((query) => query.isError),
    loadNextPage,
    loadingMore: activePageCount > 1 && lastQuery?.isPending === true,
    mainQuotes: sections.mainQuotes,
    pending: (pinPriorityQuotes && priorityQuery.isPending) || listQueries.some((query) => query.isPending),
    priorityQuotes: sections.priorityQuotes,
    total: loadedPages.at(0)?.total ?? null,
  };
}
