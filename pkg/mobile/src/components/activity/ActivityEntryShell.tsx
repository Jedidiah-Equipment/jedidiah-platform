import { formatDate } from '@pkg/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** One timeline row: the time on the rail, a marker, who (or what) it is about, and the entry itself. */
export function ActivityEntryShell({
  children,
  last,
  marker,
  occurredAt,
  who,
}: {
  children: ReactNode;
  last: boolean;
  marker: ReactNode;
  occurredAt: string;
  who: ReactNode;
}) {
  return (
    <View className={last ? 'relative min-w-0 pb-6' : 'relative min-w-0 pb-3.5'}>
      {last ? null : <View className="absolute -bottom-3 top-3.5 left-1 w-px bg-border" />}
      <View className="h-7 flex-row items-center">
        <View className="h-2 w-2 items-center justify-center">{marker}</View>
        <Text className="ml-1.5 text-[11px] text-muted-foreground" mono>
          {formatDate(occurredAt, 'time')}
        </Text>
      </View>
      <View className="mt-1 min-w-0 flex-row items-start pl-3">
        <View className="mr-2 h-7 w-7 shrink-0 items-center justify-center">{who}</View>
        <View className="min-w-0 flex-1">{children}</View>
      </View>
    </View>
  );
}
