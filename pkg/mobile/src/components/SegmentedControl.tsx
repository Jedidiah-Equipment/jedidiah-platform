import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

export type SegmentedOption<Value extends string> = { label: string; value: Value };

/**
 * A row of equal-width pills for a small, fixed set of mutually-exclusive values — the native idiom for web's
 * dropdown or pressed-button group. Reuses the visual pattern of the theme toggle in ProfileMenu.
 */
export function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: Value;
  options: readonly SegmentedOption<Value>[];
  onChange: (value: Value) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row rounded-xl border border-border bg-muted p-1">
      {options.map((option) => {
        const selected = value === option.value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            className={`flex-1 items-center rounded-lg py-2 ${selected ? 'bg-surface' : ''}`}
            disabled={disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
          >
            <Text
              className={`text-sm ${selected ? 'text-surface-foreground' : 'text-muted-foreground'}`}
              weight={selected ? 'semibold' : 'regular'}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
