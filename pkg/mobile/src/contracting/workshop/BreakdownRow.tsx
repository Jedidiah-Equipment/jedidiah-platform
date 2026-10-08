import type { BreakdownSummary } from '@pkg/schema/contracting';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { DateText } from '@/components/DateText';
import { Text } from '@/components/ui/text';
import { BreakdownStatusBadge, BreakdownSubjectIcons } from '@/contracting/components/BreakdownSubjectIcons';

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
          <BreakdownSubjectIcons urgency={breakdown.urgency} subject={subject} />
          <Text className="min-w-0 flex-1 text-lg text-foreground" weight="bold" numberOfLines={1}>
            {subject.code}
          </Text>
        </View>
        <BreakdownStatusBadge status={breakdown.status} />
      </View>
      <Text className="text-foreground" numberOfLines={2}>
        {breakdown.firstLine}
      </Text>
      <Text className="text-sm text-muted-foreground">
        <DateText className="text-sm text-muted-foreground" date={breakdown.reportedAt} format="medium" /> ·{' '}
        {breakdown.reporterName}
        {breakdown.mechanicName ? ` · ${breakdown.mechanicName}` : ''}
      </Text>
    </Pressable>
  );
}
