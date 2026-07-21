import { useCallback, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NewQuoteModal } from '@/components/quotes/NewQuoteModal';
import {
  QuoteCatalogControls,
  QuoteCatalogHeader,
  QuoteGrid,
  QuoteGridSkeleton,
} from '@/components/quotes/QuoteCatalog';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';
import { isQuoteSort, isQuoteStatusFilter, type QuoteSort, type QuoteStatusFilter } from '@/lib/quote-presentation';
import { useCan } from '@/lib/use-access';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';
import { useQuoteList } from '@/lib/use-quote-list';

/** Quote list. The Quotes layout owns the route-level permission gate. */
export default function QuotesRoute() {
  const readAccess = useCan('quote:read');
  const createAccess = useCan('quote:create');
  const [search, setSearch] = useState('');
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const debouncedSearch = useDebouncedSearch(search);
  const [status, setStatus] = usePersistedState<QuoteStatusFilter>('jedidiah-quote-status', 'all', isQuoteStatusFilter);
  const [sort, setSort] = usePersistedState<QuoteSort>('jedidiah-quote-sort', 'newest', isQuoteSort);
  const refresh = useGlobalRefresh();
  const list = useQuoteList({ enabled: readAccess.can, search: debouncedSearch, sort, status });
  const displayedQuoteCount = list.priorityQuotes.length + list.mainQuotes.length;
  const hasCriteria = search.trim().length > 0 || status !== 'all';

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;

      if (contentSize.height - contentOffset.y - layoutMeasurement.height < 240) list.loadNextPage();
    },
    [list.loadNextPage],
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
        <QuoteCatalogHeader count={list.pending && list.total === null ? null : list.total} />
        <View className="gap-4">
          <QuoteCatalogControls
            canCreate={createAccess.can}
            onCreate={() => setNewQuoteOpen(true)}
            onSearchChange={setSearch}
            onSortChange={setSort}
            onStatusChange={setStatus}
            search={search}
            sort={sort}
            status={status}
          />

          {list.pending && displayedQuoteCount === 0 ? (
            <QuoteGridSkeleton />
          ) : list.failed ? (
            <CatalogMessage detail="Pull to retry, or check your connection." title="Couldn’t load quotes." />
          ) : displayedQuoteCount === 0 ? (
            <CatalogMessage
              detail={hasCriteria ? 'Try a different search or status.' : 'Create a Quote to see it here.'}
              title={hasCriteria ? 'No quotes match' : 'No quotes yet'}
            />
          ) : (
            <View className="gap-4">
              <QuoteGrid mainQuotes={list.mainQuotes} priorityQuotes={list.priorityQuotes} />
              {list.loadingMore ? (
                <Text className="text-center text-sm text-muted-foreground">Loading more quotes…</Text>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
      {newQuoteOpen ? <NewQuoteModal onClose={() => setNewQuoteOpen(false)} /> : null}
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
