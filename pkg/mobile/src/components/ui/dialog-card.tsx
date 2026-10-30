import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/**
 * The surface a centred `ThemedModal` shows for a decision: a title, whatever the decision needs read or filled in,
 * the last failure, then the controls. One card so every dialog puts those in the same order.
 */
export function DialogCard({
  title,
  error,
  children,
  actions,
}: {
  title: string;
  error: string | null;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <View className="w-full gap-3 rounded-2xl border border-border bg-background p-4">
      <Text className="text-lg text-foreground" weight="bold">
        {title}
      </Text>
      {children}
      {error ? <Text className="text-danger">{error}</Text> : null}
      {actions}
    </View>
  );
}
