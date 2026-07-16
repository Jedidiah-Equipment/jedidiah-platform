import { statusDaysLeftColor } from '@pkg/domain';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BayIdentityLabels } from '@/components/bays/BayIdentityLabels';
import { Text } from '@/components/ui/text';
import type { BayListCard } from '@/lib/use-bay-list';
import { useColorMode } from '@/theme/use-color-mode';

import { BoardCard, BoardCardFrame } from './BoardCard';

/**
 * One Bay tile in the Bays grid: operator, the active Job's product + code, a
 * coloured days-left countdown, end date, progress bar, and customer footer. With no Work Slot
 * running today the card shows an idle state. Tapping opens the Bay schedule (#519).
 */
export function BayCard({ bay, onPress }: { bay: BayListCard; onPress: () => void }) {
  return bay.active ? (
    <ActiveBody active={bay.active} bay={bay} onPress={onPress} />
  ) : (
    <IdleBayCard bay={bay} onPress={onPress} />
  );
}

function ActiveBody({
  active,
  bay,
  onPress,
}: {
  active: NonNullable<BayListCard['active']>;
  bay: BayListCard;
  onPress: () => void;
}) {
  const { resolved } = useColorMode();
  // The active Job is running today, so its countdown/bar use the in-progress accent (blue when
  // comfortable), turning amber then red as the finish nears.
  const accent = statusDaysLeftColor({ status: 'in-progress', daysLeft: active.remainingWorkDays, scheme: resolved });

  return (
    <BoardCard
      daysLeft={active.remainingWorkDays}
      daysLeftColor={accent}
      lastWorkDay={active.lastWorkDay}
      footerLeft={
        <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground" numberOfLines={1}>
          {active.customerCompanyName ?? '—'}
        </Text>
      }
      onPress={onPress}
      primaryRow={<BayPrimaryRow bay={bay} />}
      progressPercent={active.progressPercent}
      secondaryRow={<ActiveJobRow active={active} />}
    />
  );
}

function IdleBayCard({ bay, onPress }: { bay: BayListCard; onPress: () => void }) {
  return (
    <BoardCardFrame onPress={onPress}>
      <BayPrimaryRow bay={bay} />
      <View className="mt-3.5 h-[108px] justify-center rounded-xl border border-dashed border-border px-3">
        <Text className="text-sm text-muted-foreground" weight="semibold">
          No active job
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">No ongoing job.</Text>
      </View>
    </BoardCardFrame>
  );
}

function BayPrimaryRow({ bay }: { bay: BayListCard }) {
  return (
    <View className="flex-row items-center gap-3">
      <Avatar
        className="h-11 w-11 rounded-lg"
        name={bay.operator?.name ?? 'Unassigned'}
        uri={bay.operator?.thumbnailDataUrl}
      />
      <BayIdentityLabels bayName={bay.name} operatorName={bay.operator?.name ?? null} />
    </View>
  );
}

function ActiveJobRow({ active }: { active: NonNullable<BayListCard['active']> }) {
  return (
    <View className="flex-row items-center gap-3">
      <Avatar className="h-9 w-9 rounded-lg" name={active.jobDisplayName} uri={active.productThumbnailDataUrl} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm leading-4 text-surface-foreground" mono numberOfLines={1} weight="bold">
          {active.jobCode}
        </Text>
        <Text className="mt-0.5 text-[10px] leading-3 text-muted-foreground" numberOfLines={1}>
          {active.jobDisplayName}
        </Text>
      </View>
    </View>
  );
}
