import { daysLeftColor, formatDate } from '@pkg/domain';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/ui/text';
import type { BayListCard } from '@/lib/use-bay-list';

/**
 * One Bay tile in the Bays grid: operator, the active Job's product + code, a
 * coloured days-left countdown, end date, and a progress bar. With no Work Slot
 * running today the card shows an idle state. Tapping opens the Bay schedule (#519).
 */
export function BayCard({ bay, onPress }: { bay: BayListCard; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="rounded-2xl border border-border bg-surface p-4 active:opacity-80"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-2.5">
        <Avatar
          className="h-9 w-9 rounded-lg"
          name={bay.operator?.name ?? 'Unassigned'}
          uri={bay.operator?.thumbnailDataUrl}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-base leading-5 text-surface-foreground" numberOfLines={2} weight="bold">
            {bay.name}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
            {bay.operator?.name ?? 'No operator'}
          </Text>
        </View>
        {bay.active ? (
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-status-in-progress" />
            <Text className="text-[10px] tracking-wide text-status-in-progress" weight="semibold">
              ACTIVE
            </Text>
          </View>
        ) : null}
      </View>

      {bay.active ? <ActiveBody active={bay.active} /> : <IdleBody />}
    </Pressable>
  );
}

function ActiveBody({ active }: { active: NonNullable<BayListCard['active']> }) {
  return (
    <>
      <View className="mt-3.5 flex-row items-center gap-3">
        <Avatar className="h-9 w-9 rounded-lg" name={active.productName} uri={active.productThumbnailDataUrl} />
        <View className="min-w-0 flex-1">
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {active.productName}
          </Text>
          <Text className="mt-0.5 text-base text-surface-foreground" mono weight="bold">
            {active.jobCode}
          </Text>
        </View>
      </View>

      <View className="mt-4 flex-row items-end justify-between">
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-3xl leading-8" style={{ color: daysLeftColor(active.remainingWorkDays) }} weight="bold">
            {active.remainingWorkDays}
          </Text>
          <Text className="text-xs text-muted-foreground" weight="semibold">
            days left
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">ends</Text>
          <Text className="text-xs text-surface-foreground" weight="semibold">
            {formatDate(active.lastWorkDay, 'EEE d MMM')}
          </Text>
        </View>
      </View>

      <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <View className="h-full rounded-full bg-status-in-progress" style={{ width: `${active.progressPercent}%` }} />
      </View>
    </>
  );
}

function IdleBody() {
  return (
    <View className="mt-3.5 h-[104px] justify-center rounded-xl border border-dashed border-border px-3">
      <Text className="text-sm text-muted-foreground" weight="semibold">
        No active job
      </Text>
      <Text className="mt-0.5 text-xs text-muted-foreground">Nothing booked for today.</Text>
    </View>
  );
}
