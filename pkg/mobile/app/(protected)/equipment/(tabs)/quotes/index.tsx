import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { CatalogListSkeleton, PaginatedCatalogList } from '@/equipment/components/CatalogList';
import { NewQuoteModal } from '@/equipment/components/quotes/NewQuoteModal';
import {
  QuoteCatalogCard,
  QuoteCatalogControls,
  QuotePriorityHeader,
} from '@/equipment/components/quotes/QuoteCatalog';
import { MainTabToolbar } from '@/equipment/components/TopToolbar';
import {
  isQuoteSort,
  isQuoteStatusFilter,
  type QuoteSort,
  type QuoteStatusFilter,
} from '@/equipment/lib/quote-presentation';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useQuoteList } from '@/equipment/lib/use-quote-list';
import { useCan } from '@/lib/use-access';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';

/** Quote list. The Quotes layout owns the route-level permission gate. */
export default function QuotesRoute() {
  const readAccess = useCan('equipment_quote:read');
  const createAccess = useCan('equipment_quote:create');
  const [search, setSearch] = useState('');
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const debouncedSearch = useDebouncedSearch(search);
  const [status, setStatus] = usePersistedState<QuoteStatusFilter>('jedidiah-quote-status', 'all', isQuoteStatusFilter);
  const [sort, setSort] = usePersistedState<QuoteSort>('jedidiah-quote-sort', 'newest', isQuoteSort);
  const refresh = useGlobalRefresh();
  const list = useQuoteList({ enabled: readAccess.can, search: debouncedSearch, sort, status });
  const displayedQuoteCount = list.priorityQuotes.length + list.mainQuotes.length;
  const hasCriteria = search.trim().length > 0 || status !== 'all';
  const initialLoading = list.pending && displayedQuoteCount === 0;
  const emptyContent = list.failed ? (
    <CatalogMessage detail="Pull to retry, or check your connection." title="Couldn’t load quotes." />
  ) : (
    <CatalogMessage
      detail={hasCriteria ? 'Try a different search or status.' : 'Create a Quote to see it here.'}
      title={hasCriteria ? 'No quotes match' : 'No quotes yet'}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar
        assistantParent={MAIN_TAB_PARENTS.quotes}
        helpTopic="quotes"
        subtitle={
          list.pending && list.total === null
            ? 'Loading quotes…'
            : `${list.total ?? 0} ${list.total === 1 ? 'quote' : 'quotes'}`
        }
        title="Quotes"
      />
      <PaginatedCatalogList
        emptyContent={emptyContent}
        hasNextPage={list.hasNextPage}
        header={
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
        }
        initialLoading={initialLoading}
        keyOf={(quote) => quote.id}
        loadingContent={<CatalogListSkeleton />}
        loadingMore={list.loadingMore}
        loadingMoreLabel="Loading more quotes…"
        onLoadMore={list.loadNextPage}
        onRefresh={refresh.onRefresh}
        refreshing={refresh.refreshing}
        renderItem={(quote) => <QuoteCatalogCard quote={quote} />}
        sections={[
          ...(list.priorityQuotes.length > 0
            ? [{ data: list.priorityQuotes, header: <QuotePriorityHeader />, key: 'priority' }]
            : []),
          { data: list.mainQuotes, key: 'main' },
        ]}
      />
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
