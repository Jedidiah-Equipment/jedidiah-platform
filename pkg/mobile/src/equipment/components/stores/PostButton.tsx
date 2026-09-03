import { ActivityIndicator, Pressable } from 'react-native';

import { Text } from '@/components/ui/text';

/**
 * The one commit control on every posting screen. Big, single, and at the bottom — a tablet flow
 * that offers two similar buttons at the moment of committing stock is a flow that gets the wrong
 * one pressed.
 */
export function PostButton({
  disabled,
  isPending,
  label,
  onPress,
}: {
  disabled: boolean;
  isPending: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: isPending, disabled: disabled || isPending }}
      className={`flex-row items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-5 ${
        disabled || isPending ? 'opacity-40' : ''
      }`}
      disabled={disabled || isPending}
      onPress={onPress}
    >
      {isPending ? <ActivityIndicator color="white" size="small" /> : null}
      <Text className="text-lg text-primary-foreground" weight="bold">
        {label}
      </Text>
    </Pressable>
  );
}
