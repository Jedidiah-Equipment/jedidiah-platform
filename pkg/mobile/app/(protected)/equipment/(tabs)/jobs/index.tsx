import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { CatalogListSkeleton, PaginatedCatalogList } from '@/equipment/components/CatalogList';
import { JobCatalogCard, JobCatalogControls } from '@/equipment/components/jobs/JobCatalog';
import { MainTabToolbar } from '@/equipment/components/TopToolbar';
import {
  getJobCatalogListPresentation,
  isJobCatalogSort,
  isJobCompletionFilter,
  type JobCatalogSort,
  type JobCompletionFilter,
} from '@/equipment/lib/job-catalog';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';

const JOB_BATCH_SIZE = 20;

/** Paginated Job catalog. The Jobs layout owns the route-level permission gate. */
export default function JobsRoute() {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const [completion, setCompletion] = usePersistedState<JobCompletionFilter>(
    'jedidiah-job-completion-filter',
    'exclude-complete',
    isJobCompletionFilter,
  );
  const [sort, setSort] = usePersistedState<JobCatalogSort>('jedidiah-job-catalog-sort', 'schedule', isJobCatalogSort);
  const refresh = useGlobalRefresh();
  const jobs = useInfiniteQuery(
    trpc.jobs.list.infiniteQueryOptions(
      {
        ...getJobCatalogListPresentation(completion, sort),
        limit: JOB_BATCH_SIZE,
        search: debouncedSearch || undefined,
      },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = useMemo(() => jobs.data?.pages.flatMap((page) => page.items) ?? [], [jobs.data?.pages]);
  const total = jobs.data?.pages.at(-1)?.total ?? null;
  const hasCriteria = search.trim().length > 0 || completion !== 'exclude-complete';
  const emptyContent = jobs.isError ? (
    <CatalogMessage detail="Pull to retry, or check your connection." title="Couldn’t load Jobs." />
  ) : (
    <CatalogMessage
      detail={
        hasCriteria ? 'Try a different search or completion filter.' : 'Turn on Include Complete to see finished work.'
      }
      title={hasCriteria ? 'No Jobs match' : 'No open Jobs'}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar
        assistantParent={MAIN_TAB_PARENTS.jobs}
        helpTopic="jobs"
        subtitle={total === null ? 'Loading Jobs…' : `${total} ${total === 1 ? 'Job' : 'Jobs'}`}
        title="Jobs"
      />
      <PaginatedCatalogList
        emptyContent={emptyContent}
        hasNextPage={jobs.hasNextPage}
        header={
          <JobCatalogControls
            completion={completion}
            onCompletionChange={setCompletion}
            onSearchChange={setSearch}
            onSortChange={setSort}
            search={search}
            sort={sort}
          />
        }
        initialLoading={jobs.isPending}
        keyOf={(job) => job.id}
        loadingContent={<CatalogListSkeleton />}
        loadingMore={jobs.isFetchingNextPage}
        loadingMoreLabel="Loading more Jobs…"
        onLoadMore={() => void jobs.fetchNextPage()}
        onRefresh={refresh.onRefresh}
        refreshing={refresh.refreshing}
        renderItem={(job) => <JobCatalogCard job={job} />}
        sections={[{ data: items, key: 'jobs' }]}
      />
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
