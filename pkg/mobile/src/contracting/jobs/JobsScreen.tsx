import { formatNumber } from '@pkg/domain';
import {
  jobQueueColorClassNames,
  jobQueueLabels,
  jobQueueOf,
  jobReadMode,
  openJobQueues,
  readableJobQueues,
} from '@pkg/domain/contracting';
import { type JobQueue, type JobQueueCounts, type JobSummary, jobQueues } from '@pkg/schema/contracting';
import { IconArrowsSort, IconFilter } from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { PaginatedList } from '@/components/PaginatedList';
import { MainToolbar } from '@/components/TopToolbar';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { usePersistedState } from '@/lib/use-persisted-state';
import { type JobListSort, jobListSorts, useCanReadJobs, useJobList, useJobQueueCounts } from './use-jobs';

const STAGE_KEY = contractingStorageKey('jobs', 'stage');
const SORT_KEY = contractingStorageKey('jobs', 'sort');

/** Every open stage, or one stage, as web's Stage filter offers them. */
type StageFilter = 'open' | JobQueue;
const isStageFilter = (value: unknown): value is StageFilter =>
  value === 'open' || jobQueues.includes(value as JobQueue);
const isJobListSort = (value: unknown): value is JobListSort => jobListSorts.includes(value as JobListSort);

const SORT_OPTIONS: readonly ListControlOption<JobListSort>[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Name', value: 'name' },
];

function stageOptions(readable: readonly JobQueue[], counts: JobQueueCounts | undefined) {
  const count = (queues: readonly JobQueue[]) =>
    counts ? ` (${formatNumber(queues.reduce((total, queue) => total + counts[queue], 0))})` : '';
  const open = openJobQueues.filter((queue) => readable.includes(queue));
  return {
    open,
    options: [
      { label: `Open stages${count(open)}`, value: 'open' as const },
      ...readable.map((queue) => ({ label: `${jobQueueLabels[queue]}${count([queue])}`, value: queue })),
    ] satisfies ListControlOption<StageFilter>[],
  };
}

export default function JobsScreen() {
  const canRead = useCanReadJobs();
  const mode = jobReadMode(useSessionAccessSummary());
  const readable = mode ? readableJobQueues(mode) : [];
  const counts = useJobQueueCounts();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const [savedStage, setStage] = usePersistedState<StageFilter>(STAGE_KEY, 'open', isStageFilter);
  const [sort, setSort] = usePersistedState<JobListSort>(SORT_KEY, 'newest', isJobListSort);
  const { open, options } = stageOptions(readable, counts.data);
  // A stage saved under a broader role falls back to the open stages.
  const stage = savedStage === 'open' || readable.includes(savedStage) ? savedStage : 'open';
  const list = useJobList({ search: debouncedSearch, queues: stage === 'open' ? open : [stage], sort });
  const jobs = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Jobs" subtitle="CONTRACTING" helpTopic="contractingMobileJobs" />
      <PaginatedList
        header={
          <ListControlRow
            leading={
              <ListSearchControl
                accessibilityLabel="Search Jobs"
                onChangeText={setSearch}
                placeholder="Search by Job, customer, or farm…"
                value={search}
              />
            }
            trailing={
              <View className="flex-row items-center gap-2">
                <ListDropdownControl
                  accessibilityLabel="Filter Jobs by stage"
                  defaultValue="open"
                  dismissLabel="Dismiss Job stage filter"
                  icon={IconFilter}
                  menuWidth={240}
                  onChange={setStage}
                  options={options}
                  value={stage}
                />
                <ListDropdownControl
                  accessibilityLabel="Sort Jobs"
                  defaultValue="newest"
                  dismissLabel="Dismiss Job sort"
                  icon={IconArrowsSort}
                  onChange={setSort}
                  options={SORT_OPTIONS}
                  value={sort}
                />
              </View>
            }
          />
        }
        sections={[{ key: 'jobs', data: jobs }]}
        keyOf={(job) => job.id}
        renderItem={(job) => <JobRow job={job} />}
        initialLoading={canRead && list.isPending}
        loadingContent={<Text className="text-muted-foreground">Loading Jobs…</Text>}
        emptyContent={
          <Text className="text-muted-foreground">
            {!canRead
              ? 'Your role cannot view field Jobs.'
              : list.isError
                ? 'Unable to load Jobs. Pull to retry.'
                : search || stage !== 'open'
                  ? 'No Jobs match your search or stage filter.'
                  : 'No open Jobs.'}
          </Text>
        }
        hasNextPage={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        loadingMoreLabel="Loading more Jobs…"
        onLoadMore={() => void list.fetchNextPage()}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => {
          void list.refetch();
          void counts.refetch();
        }}
      />
    </SafeAreaView>
  );
}

function JobRow({ job }: { job: JobSummary }) {
  const queue = jobQueueOf(job);
  const machines = job.plannedStints + job.onSiteStints + job.leftStints;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/contracting/jobs/${job.id}` as Href)}
      className="w-full gap-2 rounded-xl border border-border bg-surface p-4"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="min-w-0 flex-1 text-lg text-foreground" weight="bold" numberOfLines={1}>
          {job.customerName} · {job.farmName}
        </Text>
        <View className="shrink-0">
          <StatusBadge classNames={jobQueueColorClassNames[queue]} label={jobQueueLabels[queue]} />
        </View>
      </View>
      <Text className="text-sm text-muted-foreground">
        {job.workTypeName} · {formatNumber(machines)} machines · {formatNumber(job.onSiteStints)} running
      </Text>
    </Pressable>
  );
}
