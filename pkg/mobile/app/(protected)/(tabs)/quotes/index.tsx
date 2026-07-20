import { useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  QuoteCatalogControls,
  QuoteCatalogHeader,
  QuoteGrid,
  QuoteGridSkeleton,
} from '@/components/quotes/QuoteCatalog';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';
import {
  getNextQuotePage,
  isQuoteStatusFilter,
  presentQuotePages,
  type QuoteStatusFilter,
} from '@/lib/quote-presentation';
import { useTRPC } from '@/lib/trpc';
import { useCan } from '@/lib/use-access';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
type PaginationState = { search: string; status: QuoteStatusFilter; pageCount: number };

/** Quote list. The Quotes layout owns the route-level permission gate. */
export default function QuotesRoute() {
  const trpc = useTRPC();
  const readAccess = useCan('quote:read');
  const createAccess = useCan('quote:create');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = usePersistedState<QuoteStatusFilter>('jedidiah-quote-status', 'all', isQuoteStatusFilter);
  const [pagination, setPagination] = useState<PaginationState>({ search: debouncedSearch, status, pageCount: 1 });
  const loadingNextPage = useRef(false);
  const paginationMatchesQuery = pagination.search === debouncedSearch && pagination.status === status;
  const activePageCount = paginationMatchesQuery ? pagination.pageCount : 1;
  const refresh = useGlobalRefresh();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPagination({ search: debouncedSearch, status, pageCount: 1 });
    loadingNextPage.current = false;
  }, [debouncedSearch, status]);

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
          search: debouncedSearch || undefined,
          sortBy: 'createdAt',
          sortDirection: 'desc',
        },
        { enabled: readAccess.can },
      ),
    ),
  });
  const priorityQuery = useQuery(
    trpc.quotes.priorityList.queryOptions(undefined, {
      enabled: readAccess.can,
    }),
  );
  const loadedPages = listQueries.flatMap((query) => (query.data ? [query.data] : []));
  const priorityQuotes = priorityQuery.data ?? [];
  const quoteSections = presentQuotePages(loadedPages, priorityQuotes);
  const displayedQuoteCount = quoteSections.priorityQuotes.length + quoteSections.mainQuotes.length;
  const total = loadedPages.at(0)?.total ?? null;
  const lastPage = loadedPages.at(-1);
  const nextPage = lastPage ? getNextQuotePage(lastPage, loadedPages) : undefined;
  const lastQuery = listQueries.at(-1);
  const pending = priorityQuery.isPending || listQueries.some((query) => query.isPending);
  const failed = priorityQuery.isError || listQueries.some((query) => query.isError);
  const loadingMore = activePageCount > 1 && lastQuery?.isPending === true;
  const hasCriteria = search.trim().length > 0 || status !== 'all';

  useEffect(() => {
    if (!lastQuery?.isPending) loadingNextPage.current = false;
  }, [lastQuery?.isPending]);

  const loadNextPage = useCallback(() => {
    if (nextPage === undefined || loadingNextPage.current) return;

    loadingNextPage.current = true;
    setPagination({ search: debouncedSearch, status, pageCount: nextPage });
  }, [debouncedSearch, nextPage, status]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;

      if (contentSize.height - contentOffset.y - layoutMeasurement.height < 240) loadNextPage();
    },
    [loadNextPage],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-[1180px] gap-5 px-4 pb-8 pt-4"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        refreshControl={<RefreshControl {...refresh} />}
        scrollEventThrottle={100}
      >
        <QuoteCatalogHeader count={pending && total === null ? null : total} />
        <QuoteCatalogControls
          canCreate={createAccess.can}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          search={search}
          status={status}
        />

        {pending && displayedQuoteCount === 0 ? (
          <QuoteGridSkeleton />
        ) : failed ? (
          <CatalogMessage detail="Pull to retry, or check your connection." title="Couldn’t load quotes." />
        ) : displayedQuoteCount === 0 ? (
          <CatalogMessage
            detail={hasCriteria ? 'Try a different search or status.' : 'Create a Quote to see it here.'}
            title={hasCriteria ? 'No quotes match' : 'No quotes yet'}
          />
        ) : (
          <View className="gap-4">
            <QuoteGrid mainQuotes={quoteSections.mainQuotes} priorityQuotes={quoteSections.priorityQuotes} />
            {loadingMore ? (
              <Text className="text-center text-sm text-muted-foreground">Loading more quotes…</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CatalogMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <View>
      <Text className="text-sm text-foreground" weight="semibold">
        {title}
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">{detail}</Text>
    </View>
  );
}
