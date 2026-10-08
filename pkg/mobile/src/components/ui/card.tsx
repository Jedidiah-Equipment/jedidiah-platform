import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** A detail-page card: a bordered surface, with an optional bold heading, and an action at its right, above its content. */
export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-surface p-4">
      {title ? (
        <View className="flex-row items-center justify-between gap-2">
          <Text className="min-w-0 flex-1 text-lg text-foreground" weight="bold">
            {title}
          </Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** An icon-only button for a card's heading, such as the pencil that edits the card's content. */
export function CardIconAction({ icon, label, onPress }: { icon: TablerIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-9 w-9 items-center justify-center rounded-lg border border-border active:bg-muted"
      hitSlop={6}
      onPress={onPress}
    >
      <Icon className="text-muted-foreground" icon={icon} size={18} />
    </Pressable>
  );
}
