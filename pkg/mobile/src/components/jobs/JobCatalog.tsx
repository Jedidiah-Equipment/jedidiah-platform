import { formatDate, getJobDisplayName, statusBadgeColorClassNames } from '@pkg/domain';
import type { JobSummary } from '@pkg/schema';
import { IconArrowsSort, IconCheck, IconFilter, IconTools } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { CatalogListCard } from '@/components/CatalogList';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { getJobSchedulePresentation, type JobCatalogSort, type JobCompletionFilter } from '@/lib/job-catalog';

const COMPLETION_OPTIONS: readonly ListControlOption<JobCompletionFilter>[] = [
  { label: 'Exclude Complete', value: 'exclude-complete' },
  { label: 'Include Complete', value: 'include-complete' },
];
const SORT_OPTIONS: readonly ListControlOption<JobCatalogSort>[] = [
  { label: 'Schedule', value: 'schedule' },
  { label: 'Job Code', value: 'code' },
];

export function JobCatalogControls({
  completion,
  onCompletionChange,
  onSearchChange,
  onSortChange,
  search,
  sort,
}: {
  completion: JobCompletionFilter;
  onCompletionChange: (completion: JobCompletionFilter) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: JobCatalogSort) => void;
  search: string;
  sort: JobCatalogSort;
}) {
  return (
    <ListControlRow
      leading={
        <ListSearchControl
          accessibilityLabel="Search jobs"
          onChangeText={onSearchChange}
          placeholder="Search by Job code, serial, or work title…"
          value={search}
        />
      }
      trailing={
        <View className="flex-row items-center gap-2">
          <ListDropdownControl
            accessibilityLabel="Filter completed jobs"
            defaultValue="exclude-complete"
            dismissLabel="Dismiss Job completion filter"
            icon={IconFilter}
            onChange={onCompletionChange}
            options={COMPLETION_OPTIONS}
            value={completion}
          />
          <ListDropdownControl
            accessibilityLabel="Sort jobs"
            defaultValue="schedule"
            dismissLabel="Dismiss Job sort"
            icon={IconArrowsSort}
            onChange={onSortChange}
            options={SORT_OPTIONS}
            value={sort}
          />
        </View>
      }
    />
  );
}

export function JobCatalogCard({ job }: { job: JobSummary }) {
  const router = useRouter();
  const displayName = getJobDisplayName(job);
  const owner = job.customerCompanyName ?? 'Stock';
  const serial = job.productUnit?.productSerialNumber;

  return (
    <CatalogListCard
      accessibilityHint="Opens Job details"
      accessibilityLabel={`Job ${job.code}`}
      avatarFallback={
        job.quoteKind === 'custom' ? <Icon className="text-muted-foreground" icon={IconTools} size={22} /> : undefined
      }
      avatarName={displayName}
      avatarUri={job.productThumbnailDataUrl}
      mainText={job.code}
      monoText={serial ? `${owner} · ${serial}` : owner}
      onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.id } })}
      subText={displayName}
      trailing={<JobScheduleSummary job={job} />}
    />
  );
}

function JobScheduleSummary({ job }: { job: JobSummary }) {
  const schedule = getJobSchedulePresentation(job);

  return (
    <View className="max-w-36 flex-row flex-wrap items-center justify-end gap-1">
      {schedule.map((item) => (
        <JobScheduleBadge item={item} key={item.tone} />
      ))}
      {job.completedOn ? (
        <View className="flex-row items-center gap-1">
          <Icon className="text-status-next" icon={IconCheck} size={11} />
          <Text className="text-[9px] text-status-next" mono numberOfLines={1} weight="semibold">
            {formatDate(job.completedOn, 'd MMM yyyy')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function JobScheduleBadge({ item }: { item: ReturnType<typeof getJobSchedulePresentation>[number] }) {
  const classNames = statusBadgeColorClassNames[item.tone];

  return (
    <View className={`rounded-full border px-2 py-1 ${classNames.chip}`}>
      <Text className={`text-[10px] tracking-wide ${classNames.text}`} mono numberOfLines={1} weight="semibold">
        {item.count === null ? item.label : `${item.count} ${item.label}`}
      </Text>
    </View>
  );
}
