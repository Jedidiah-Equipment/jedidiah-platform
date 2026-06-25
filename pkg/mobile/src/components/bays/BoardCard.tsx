import { formatDate } from '@pkg/domain';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

export function BoardCardFrame({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="rounded-2xl border border-border bg-surface p-4 active:opacity-80"
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

export function BoardCard({
  daysLeft,
  daysLeftColor,
  endDate,
  footerLeft,
  footerRight,
  onPress,
  primaryRow,
  progressPercent,
  secondaryRow,
}: {
  daysLeft: number;
  daysLeftColor: string;
  endDate: string;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  onPress: () => void;
  primaryRow: ReactNode;
  progressPercent: number;
  secondaryRow: ReactNode;
}) {
  const hasFooter = footerLeft !== undefined || footerRight !== undefined;

  return (
    <BoardCardFrame onPress={onPress}>
      {primaryRow}

      <View className="mt-3">{secondaryRow}</View>

      <View className="mt-3.5 flex-row items-end justify-between">
        <View className="min-w-0 flex-row items-baseline gap-1.5">
          <Text className="text-3xl leading-8" style={{ color: daysLeftColor }} weight="bold">
            {daysLeft}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1} weight="semibold">
            {daysLeft === 1 ? 'working day left' : 'working days left'}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">ends</Text>
          <Text className="text-xs text-surface-foreground" numberOfLines={1} weight="semibold">
            {formatDate(endDate, 'EEE d MMM')}
          </Text>
        </View>
      </View>

      <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <View
          className="h-full rounded-full"
          style={{ backgroundColor: daysLeftColor, width: `${progressPercent}%` }}
        />
      </View>

      {hasFooter ? (
        <View className="mt-2.5 flex-row items-center justify-between gap-3">
          {footerLeft}
          {footerRight}
        </View>
      ) : null}
    </BoardCardFrame>
  );
}
