import { jobStatusAccentColor } from '@pkg/domain';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BayIdentityLabels } from '@/components/bays/BayIdentityLabels';
import { Text } from '@/components/ui/text';
import type { JobListCard } from '@/lib/use-job-list';
import { useColorMode } from '@/theme/use-color-mode';

import { BoardCard } from './BoardCard';

/**
 * One Job tile in the Jobs grid: product + Job code, operator + Bay name, a coloured days-left
 * countdown paced by the latest-ending Bay, a work-day-weighted overall-progress bar, and the
 * customer + 'bay X of N' stage label. Tapping opens the Job Detail screen (#615).
 */
export function JobCard({ job, onPress }: { job: JobListCard; onPress: () => void }) {
  const { progress } = job;
  const { resolved } = useColorMode();
  const dayColor = jobStatusAccentColor(job.tone, resolved);

  return (
    <BoardCard
      daysLeft={progress.daysLeft}
      daysLeftColor={dayColor}
      lastWorkDay={progress.lastWorkDay}
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
      secondaryRow={<OperatorRow bayName={progress.currentBayName} job={job} />}
    />
  );
}

function JobPrimaryRow({ job }: { job: JobListCard }) {
  return (
    <View className="flex-row items-center gap-3">
      <Avatar className="h-11 w-11 rounded-lg" name={job.jobDisplayName} uri={job.productThumbnailDataUrl} />
      <View className="min-w-0 flex-1">
        <Text className="text-base text-surface-foreground" mono numberOfLines={1} weight="bold">
          {job.jobCode}
        </Text>
        <Text className="mt-0.5 text-[10px] leading-3 text-muted-foreground" numberOfLines={1}>
          {job.jobDisplayName}
        </Text>
      </View>
    </View>
  );
}

function OperatorRow({ bayName, job }: { bayName: string; job: JobListCard }) {
  return (
    <View className="flex-row items-center gap-3">
      <Avatar
        className="h-9 w-9 rounded-lg"
        name={job.operator?.name ?? 'Unassigned'}
        uri={job.operator?.thumbnailDataUrl}
      />
      <BayIdentityLabels bayName={bayName} operatorName={job.operator?.name ?? null} />
    </View>
  );
}
