import type { BayOperator } from '@pkg/schema';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { Text } from '@/components/ui/text';

/**
 * Shared top bar for a Bay's schedule: a back button, the Bay operator's avatar,
 * the Bay name over a 'Bay schedule' caption, and the overflow {@link ProfileMenuButton}
 * (theme toggle + Log out). Mirrors the Bay List's {@link ProfileHeader} layout.
 */
export function ScheduleHeader({
  title,
  subtitle = 'Bay schedule',
  operator,
  onBack,
}: {
  title: string;
  /** Caption under the title — switches to 'Job slot' when a phone shows the detail pane (#520). */
  subtitle?: string;
  operator: BayOperator | null;
  onBack: () => void;
}) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-background px-4 py-3">
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
        onPress={onBack}
      >
        <Text className="text-lg leading-5 text-foreground" weight="semibold">
          ‹
        </Text>
      </Pressable>

      <Avatar
        className="h-10 w-10 rounded-full"
        name={operator?.name ?? 'Unassigned'}
        uri={operator?.thumbnailDataUrl}
      />

      <View className="min-w-0 flex-1">
        <Text className="text-base leading-5 text-foreground" numberOfLines={1} weight="bold">
          {title}
        </Text>
        <Text className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{subtitle}</Text>
      </View>

      <ProfileMenuButton />
    </View>
  );
}
