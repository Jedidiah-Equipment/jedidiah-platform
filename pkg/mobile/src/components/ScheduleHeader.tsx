import type { BayOperator } from '@pkg/schema';
import { IconChevronLeft } from '@tabler/icons-react-native';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * Shared top bar for a Bay schedule, Bay slot, or Job detail: a back button, optional operator
 * avatar, primary title over an optional caption, and the overflow {@link ProfileMenuButton}.
 */
export function ScheduleHeader({
  title,
  subtitle,
  operator,
  onBack,
  showOperatorAvatar = true,
  titleMono = false,
}: {
  title: string;
  /** Caption under the title — bay name on schedule, product name on slot/Job detail; omit for none. */
  subtitle?: string;
  operator: BayOperator | null;
  onBack: () => void;
  showOperatorAvatar?: boolean;
  titleMono?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-background px-4 py-3">
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
        onPress={onBack}
      >
        <Icon icon={IconChevronLeft} size={20} />
      </Pressable>

      {showOperatorAvatar ? (
        <Avatar
          className="h-10 w-10 rounded-lg"
          name={operator?.name ?? 'No operator'}
          uri={operator?.thumbnailDataUrl}
        />
      ) : null}

      <View className="min-w-0 flex-1">
        <Text className="text-base leading-5 text-foreground" mono={titleMono} numberOfLines={1} weight="bold">
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <ProfileMenuButton />
    </View>
  );
}
