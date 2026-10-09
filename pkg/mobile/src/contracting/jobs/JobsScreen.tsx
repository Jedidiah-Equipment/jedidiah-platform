import { formatNumber } from '@pkg/domain';
import { jobQueueColorClassNames, jobQueueLabels, jobQueueOf } from '@pkg/domain/contracting';
import type { JobSummary } from '@pkg/schema/contracting';
import { IconArrowsSort, IconFilter } from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CatalogListCard } from '@/components/CatalogList';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { infiniteQueryPagination, TabRootList } from '@/components/TabRootList';
import { MainToolbar } from '@/components/TopToolbar';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
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
      <TabRootList
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
        pagination={infiniteQueryPagination(list, 'Loading more Jobs…')}
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
      />
    </SafeAreaView>
  );
}

function JobRow({ job }: { job: JobSummary }) {
  const queue = jobQueueOf(job);
  const machines = job.plannedStints + job.onSiteStints + job.leftStints;
  return (
    <CatalogListCard
      accessibilityHint="Opens the Job"
      accessibilityLabel={`Job ${job.jobNumber}`}
      mainText={job.customerName}
      monoText={`${job.jobNumber} · ${formatNumber(machines)} machines · ${formatNumber(job.onSiteStints)} running`}
      onPress={() => router.push(`/contracting/jobs/${job.id}` as Href)}
      subText={`${job.farmName} · ${job.workTypeName}`}
      trailing={<StatusBadge classNames={jobQueueColorClassNames[queue]} label={jobQueueLabels[queue]} />}
    />
  );
}
