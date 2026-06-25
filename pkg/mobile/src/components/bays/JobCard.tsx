import { statusDaysLeftColor } from '@pkg/domain';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/ui/text';
import type { JobListCard } from '@/lib/use-job-list';
import { useColorMode } from '@/theme/use-color-mode';

import { BoardCard } from './BoardCard';
import { STATUS_TONE } from './status-chip';

/**
 * One Job tile in the Jobs grid: product + Job code, operator + Bay status, a coloured days-left
 * countdown paced by the latest-ending Bay, a work-day-weighted overall-progress bar, and the
 * customer + 'bay X of N' stage label. Tapping opens the Job Detail screen (#615).
 */
export function JobCard({ job, onPress }: { job: JobListCard; onPress: () => void }) {
  const { progress } = job;
  const { resolved } = useColorMode();
  const isActive = progress.status === 'in-progress';
  // Countdown + bar share the status accent: blue while in progress, green while queued, amber/red
  // as the finish nears.
  const dayColor = statusDaysLeftColor({ status: progress.status, daysLeft: progress.daysLeft, scheme: resolved });
  const bayLabel = progress.currentBayName.toUpperCase();

  return (
    <BoardCard
      daysLeft={progress.daysLeft}
      daysLeftColor={dayColor}
      endDate={progress.lastWorkDay}
      footerLeft={
        <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground" numberOfLines={1}>
          {job.customerCompanyName ?? '—'}
        </Text>
      }
      footerRight={
        <Text className="text-[11px] uppercase tracking-wide text-muted-foreground" mono weight="semibold">
          bay {progress.stageIndex} of {progress.stageCount}
        </Text>
      }
      onPress={onPress}
      primaryRow={<JobPrimaryRow job={job} />}
      progressPercent={progress.overallPercent}
      secondaryRow={<OperatorRow bayLabel={bayLabel} isActive={isActive} job={job} />}
    />
  );
}

function JobPrimaryRow({ job }: { job: JobListCard }) {
  return (
    <View className="flex-row items-center gap-3">
      <Avatar className="h-11 w-11 rounded-lg" name={job.productName} uri={job.productThumbnailDataUrl} />
      <View className="min-w-0 flex-1">
        <Text className="text-base text-surface-foreground" mono numberOfLines={1} weight="bold">
          {job.jobCode}
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
          {job.productName}
        </Text>
      </View>
    </View>
  );
}

function OperatorRow({ bayLabel, isActive, job }: { bayLabel: string; isActive: boolean; job: JobListCard }) {
  const tone = STATUS_TONE[isActive ? 'in-progress' : 'next'];

  return (
    <View className="flex-row items-center gap-3">
      <Avatar
        className="h-9 w-9 rounded-lg"
        name={job.operator?.name ?? 'Unassigned'}
        uri={job.operator?.thumbnailDataUrl}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-sm leading-4 text-surface-foreground" numberOfLines={1} weight="semibold">
          {job.operator?.name ?? 'No operator'}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          <View className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          <Text className={`text-[10px] leading-3 tracking-wide ${tone.text}`} numberOfLines={1} weight="semibold">
            {isActive ? `IN ${bayLabel}` : `NEXT · ${bayLabel}`}
          </Text>
        </View>
      </View>
    </View>
  );
}
