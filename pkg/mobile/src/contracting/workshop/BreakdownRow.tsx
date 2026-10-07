import { formatNumber } from '@pkg/domain';
import {
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
} from '@pkg/domain/contracting';
import type { BreakdownSummary } from '@pkg/schema/contracting';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { DateText } from '@/components/DateText';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';

/** One Breakdown in a list, opening its detail: the Workshop tab's rows and a Machine's open Breakdowns. */
export function BreakdownRow({ breakdown }: { breakdown: BreakdownSummary }) {
  const { subject } = breakdown;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: breakdown.id } })
      }
      className="w-full gap-2 rounded-xl border border-border bg-surface p-4"
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <CategoryIcon icon={subject.categoryIcon} colour={subject.categoryColour} size={20} />
          <Text className="min-w-0 flex-1 text-lg text-foreground" weight="bold" numberOfLines={1}>
            {subject.code}
          </Text>
        </View>
        <View className="shrink-0 flex-row gap-1">
          <StatusBadge
            classNames={breakdownUrgencyColorClassNames[breakdown.urgency]}
            label={breakdownUrgencyLabels[breakdown.urgency]}
          />
          <StatusBadge
            classNames={breakdownStatusColorClassNames[breakdown.status]}
            label={breakdownStatusLabels[breakdown.status]}
          />
        </View>
      </View>
      <Text className="text-foreground" numberOfLines={2}>
        {breakdown.firstLine}
      </Text>
      <Text className="text-sm text-muted-foreground">
        <DateText className="text-sm text-muted-foreground" date={breakdown.reportedAt} format="medium" /> ·{' '}
        {breakdown.reporterName}
        {breakdown.mechanicName ? ` · ${breakdown.mechanicName}` : ''}
      </Text>
      {breakdown.sameJobOpenCount > 0 ? (
        <Text className="text-sm text-foreground" weight="semibold">
          +{formatNumber(breakdown.sameJobOpenCount)} open on this Job
        </Text>
      ) : null}
    </Pressable>
  );
}
