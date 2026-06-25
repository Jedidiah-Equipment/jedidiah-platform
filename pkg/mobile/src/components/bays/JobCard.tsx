import { daysLeftColor, formatDate } from '@pkg/domain';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/ui/text';
import type { JobListCard } from '@/lib/use-job-list';

/**
 * One Job tile in the Jobs grid: product + Job code, a status chip naming the Bay the Job is in
 * (or the next Bay when none is active today), a coloured days-left countdown paced by the
 * latest-ending Bay, a work-day-weighted overall-progress bar, and the customer + 'bay X of N'
 * stage label. Tapping opens the Job Detail screen (#615).
 */
export function JobCard({ job, onPress }: { job: JobListCard; onPress: () => void }) {
  const { progress } = job;
  const isActive = progress.status === 'in-progress';
  const dayColor = daysLeftColor(progress.daysLeft);
  const bayLabel = progress.currentBayName.toUpperCase();

  return (
    <Pressable
      accessibilityRole="button"
      className="rounded-2xl border border-border bg-surface p-4 active:opacity-80"
      onPress={onPress}
    >
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

      {/* Status chip: the Bay the Job is in now, or the next Bay to start. */}
      <View className="mt-3.5 flex-row items-center gap-1.5">
        <View className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-status-in-progress' : 'bg-status-next'}`} />
        <Text
          className={`text-[10px] tracking-wide ${isActive ? 'text-status-in-progress' : 'text-status-next'}`}
          numberOfLines={1}
          weight="semibold"
        >
          {isActive ? `IN ${bayLabel}` : `NEXT · ${bayLabel}`}
        </Text>
      </View>

      <View className="mt-3.5 flex-row items-end justify-between">
        <View className="min-w-0 flex-row items-baseline gap-1.5">
          <Text className="text-3xl leading-8" style={{ color: dayColor }} weight="bold">
            {progress.daysLeft}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1} weight="semibold">
            days left
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">done</Text>
          <Text className="text-xs text-surface-foreground" numberOfLines={1} weight="semibold">
            {formatDate(progress.lastWorkDay, 'EEE d MMM')}
          </Text>
        </View>
      </View>

      <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <View
          className="h-full rounded-full"
          style={{ backgroundColor: dayColor, width: `${progress.overallPercent}%` }}
        />
      </View>

      <View className="mt-2.5 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground" numberOfLines={1}>
          {job.customerCompanyName ?? '—'}
        </Text>
        <Text className="text-[11px] uppercase tracking-wide text-muted-foreground" mono weight="semibold">
          bay {progress.stageIndex} of {progress.stageCount}
        </Text>
      </View>
    </Pressable>
  );
}
