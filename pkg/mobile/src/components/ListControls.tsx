import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

export type SegmentedSortOption<Value extends string> = {
  label: string;
  value: Value;
};

/** Fixed-height list controls stay on one row; their labels truncate as available width shrinks. */
export function ListControlRow({ leading, trailing }: { leading: ReactNode; trailing: ReactNode }) {
  return (
    <View className="z-10 h-10 flex-row items-center gap-2">
      <View className="min-w-0 flex-1">{leading}</View>
      <View className="min-w-0 shrink">{trailing}</View>
    </View>
  );
}

/** Shared SORT label and segmented control used by every sortable landing-screen list. */
export function SegmentedSortControl<Value extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentedSortOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <View className="h-10 min-w-0 flex-row items-center gap-2">
      <Text className="shrink-0 text-[10px] tracking-widest text-muted-foreground" mono weight="semibold">
        SORT
      </Text>
      <View className="h-10 min-w-0 shrink flex-row rounded-xl border border-border bg-surface p-1">
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`Sort by ${option.label.toLowerCase()}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`min-w-0 shrink self-stretch justify-center rounded-lg border px-3 ${
                selected ? 'border-border bg-elevated' : 'border-transparent'
              }`}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={`text-[11px] tracking-wider ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
                mono
                numberOfLines={1}
                weight="semibold"
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
