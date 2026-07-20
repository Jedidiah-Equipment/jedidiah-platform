import { IconCalendar, IconX } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { fieldStateClassNames } from '../utils/field-style';

/** Shared trigger + clear chrome for the native and web `DateField` variants. */
export function DateFieldTrigger({
  disabled,
  expanded,
  hasErrors,
  label,
  onClear,
  onOpen,
  placeholder,
  value,
}: {
  disabled: boolean;
  expanded?: boolean;
  hasErrors: boolean;
  label: ReactNode;
  onClear: () => void;
  onOpen: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View className="flex-row gap-2">
      <Pressable
        accessibilityLabel={String(label)}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded }}
        className={`h-12 min-w-0 flex-1 flex-row items-center justify-between rounded-xl border bg-surface px-3 ${fieldStateClassNames(
          { disabled, hasErrors },
        )} ${disabled ? '' : 'active:bg-muted'}`}
        disabled={disabled}
        onPress={onOpen}
      >
        <Text className={`text-sm ${value ? 'text-surface-foreground' : 'text-muted-foreground'}`}>
          {value || placeholder}
        </Text>
        <Icon className="text-muted-foreground" icon={IconCalendar} size={17} />
      </Pressable>
      {value && !disabled ? (
        <Pressable
          accessibilityLabel={`Clear ${String(label)}`}
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
          onPress={onClear}
        >
          <Icon className="text-muted-foreground" icon={IconX} size={17} />
        </Pressable>
      ) : null}
    </View>
  );
}
