import type { HelpTopic } from '@pkg/domain';
import { IconChevronLeft } from '@tabler/icons-react-native';
import type React from 'react';
import { Pressable, View } from 'react-native';

import { AppIcon } from '@/components/AppLogo';
import { AssistantEntryButton } from '@/components/assistant/AssistantEntryButton';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { MainTabParent } from '@/lib/toolbar-navigation';

export function MainTabToolbar({
  assistantParent,
  helpTopic,
  subtitle,
  title,
}: {
  assistantParent: MainTabParent;
  helpTopic?: HelpTopic;
  subtitle: string;
  title: string;
}) {
  return (
    <ToolbarFrame>
      <View className="shrink-0">
        <AppIcon size={40} />
      </View>
      <ToolbarTitle subtitle={subtitle} title={title} />
      <AssistantEntryButton parent={assistantParent} />
      <ProfileMenuButton helpTopic={helpTopic} />
    </ToolbarFrame>
  );
}

export function SecondaryPageToolbar({
  avatar,
  badge,
  helpTopic,
  onBack,
  parentLabel,
  subtitle,
  title,
}: {
  avatar?: React.ReactNode;
  badge?: React.ReactNode;
  helpTopic?: HelpTopic;
  onBack: () => void;
  parentLabel: string;
  subtitle: string;
  title: string;
}) {
  return (
    <ToolbarFrame bordered>
      <Pressable
        accessibilityLabel={`Back to ${parentLabel}`}
        accessibilityRole="button"
        className="h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
        onPress={onBack}
      >
        <Icon icon={IconChevronLeft} size={20} />
      </Pressable>
      {avatar === undefined ? null : (
        <View className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">{avatar}</View>
      )}
      <ToolbarTitle subtitle={subtitle} title={title} />
      {badge === undefined ? null : (
        <View className="h-10 shrink-0 items-center justify-center" testID="secondary-toolbar-badge">
          {badge}
        </View>
      )}
      <ProfileMenuButton helpTopic={helpTopic} />
    </ToolbarFrame>
  );
}

function ToolbarFrame({ bordered = false, children }: { bordered?: boolean; children: React.ReactNode }) {
  return (
    <View
      className={`min-h-16 w-full flex-row items-center gap-2 bg-background px-4 py-3 ${
        bordered ? 'border-b border-border' : ''
      }`}
      style={{ minHeight: 64 }}
    >
      {children}
    </View>
  );
}

function ToolbarTitle({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="text-base leading-5 text-foreground" numberOfLines={1} weight="bold">
        {title}
      </Text>
      <Text className="mt-0.5 text-[11px] text-muted-foreground" mono numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );
}
