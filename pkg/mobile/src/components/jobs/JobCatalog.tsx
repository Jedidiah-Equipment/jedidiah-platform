import { formatDate, getJobDisplayName, getJobOfferingKind, statusBadgeColorClassNames } from '@pkg/domain';
import type { JobSummary } from '@pkg/schema';
import { IconArrowsSort, IconCheck, IconFilter } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { CatalogListCard } from '@/components/CatalogList';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { offeringAvatarProps } from '@/components/OfferingAvatar';
import { StockBadge } from '@/components/StockBadge';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
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
          placeholder="Search by job code, serial, or work title…"
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
  const serial = job.productUnit?.productSerialNumber;
  const avatar = offeringAvatarProps(getJobOfferingKind(job));

  return (
    <CatalogListCard
      accessibilityHint="Opens Job details"
      accessibilityLabel={`Job ${job.code}`}
      avatarClassName={avatar.className}
      avatarFallback={avatar.fallback}
      avatarName={displayName}
      avatarUri={job.productThumbnailDataUrl}
      mainText={job.code}
      metadata={
        job.customerCompanyName === null ? (
          <>
            <StockBadge size="compact" />
            {serial ? (
              <Text className="text-[10px] text-muted-foreground" mono numberOfLines={1}>
                · {serial}
              </Text>
            ) : null}
          </>
        ) : undefined
      }
      monoText={
        job.customerCompanyName === null
          ? undefined
          : serial
            ? `${job.customerCompanyName} · ${serial}`
            : job.customerCompanyName
      }
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
    <StatusBadge
      classNames={classNames}
      label={item.count === null ? item.label : `${item.count} ${item.label}`}
      numberOfLines={1}
    />
  );
}
