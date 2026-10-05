import { formatNumber } from '@pkg/domain';
import { jobQueueColorClassNames, jobQueueLabels, jobQueueOf } from '@pkg/domain/contracting';
import type { JobSummary } from '@pkg/schema/contracting';
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
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { usePersistedState } from '@/lib/use-persisted-state';
import { isStageFilter, readableStage, type StageFilter, stageOptions, stageQueues } from './job-stage-filter';
import { type JobListSort, jobListSorts, useJobList, useJobListAccess, useJobQueueCounts } from './use-jobs';

const STAGE_KEY = contractingStorageKey('jobs', 'stage');
const SORT_KEY = contractingStorageKey('jobs', 'sort');

const isJobListSort = (value: unknown): value is JobListSort => jobListSorts.includes(value as JobListSort);

const SORT_OPTIONS: readonly ListControlOption<JobListSort>[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Name', value: 'name' },
];

export default function JobsScreen() {
  const { canRead, readable, open } = useJobListAccess();
  const counts = useJobQueueCounts();
  const refresh = useGlobalRefresh();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const [savedStage, setStage] = usePersistedState<StageFilter>(STAGE_KEY, 'open', isStageFilter);
  const [sort, setSort] = usePersistedState<JobListSort>(SORT_KEY, 'newest', isJobListSort);
  const stage = readableStage(savedStage, readable);
  const list = useJobList({ search: debouncedSearch, queues: stageQueues(stage, open), sort });
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
                  options={stageOptions(readable, open, counts.data)}
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
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
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
