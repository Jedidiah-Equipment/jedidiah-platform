import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

export type SubTabOption<Value extends string> = {
  label: string;
  value: Value;
};

/** Shared segmented sub-navigation used inside mobile detail pages. */
export function SubTabControl<Value extends string>({
  activeValue,
  onChange,
  tabs,
}: {
  activeValue: Value;
  onChange: (value: Value) => void;
  tabs: readonly SubTabOption<Value>[];
}) {
  return (
    <View className="flex-row rounded-xl border border-border bg-muted p-1">
      {tabs.map((tab) => {
        const active = tab.value === activeValue;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`rounded-lg px-4 py-2 ${active ? 'bg-surface' : ''}`}
            key={tab.value}
            onPress={() => onChange(tab.value)}
          >
            <Text className={`text-xs ${active ? 'text-foreground' : 'text-muted-foreground'}`} weight="semibold">
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
