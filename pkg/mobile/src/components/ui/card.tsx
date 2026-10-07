import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** A detail-page card: a bordered surface, with an optional bold heading above its content. */
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-surface p-4">
      {title ? (
        <Text className="text-lg text-foreground" weight="bold">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
