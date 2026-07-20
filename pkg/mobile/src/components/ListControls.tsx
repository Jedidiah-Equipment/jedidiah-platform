import { IconChevronDown, IconFilter } from '@tabler/icons-react-native';
import { forwardRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
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

export const ListFilterButton = forwardRef<
  View,
  {
    accessibilityLabel: string;
    active: boolean;
    expanded: boolean;
    label: string;
    onPress: () => void;
    showLabel?: boolean;
  }
>(function ListFilterButton({ accessibilityLabel, active, expanded, label, onPress, showLabel = true }, ref) {
  const accentClassName = active ? 'text-primary' : 'text-muted-foreground';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className={`h-10 min-w-0 max-w-full flex-row items-center gap-2 rounded-xl border px-3 ${
        active ? 'border-primary bg-primary/10' : 'border-border bg-surface'
      }`}
      onPress={onPress}
      ref={ref}
    >
      <Icon className={accentClassName} icon={IconFilter} size={15} />
      {showLabel ? (
        <>
          <Text
            className={`min-w-0 flex-1 text-[13px] tracking-wide ${accentClassName}`}
            numberOfLines={1}
            weight="semibold"
          >
            {label}
          </Text>
          <Icon className={accentClassName} icon={IconChevronDown} size={13} />
        </>
      ) : null}
    </Pressable>
  );
});

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
      <Text className="shrink-0 text-[13px] tracking-widest text-muted-foreground" weight="semibold">
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
                className={`text-[13px] tracking-wider ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
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
