import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** One fact on a detail card: its label on the left and its value on the right. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="text-muted-foreground">{label}</Text>
      <View className="min-w-0 shrink items-end">{children}</View>
    </View>
  );
}
