import type { HelpTopic } from '@pkg/domain';
import { IconChevronLeft } from '@tabler/icons-react-native';
import type { Href } from 'expo-router';
import type React from 'react';
import { Pressable, View } from 'react-native';

import { AppIcon } from '@/components/AppLogo';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { TOOLBAR_INSET } from '@/components/page-frame';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useGoBack } from '@/lib/use-go-back';

export function MainToolbar({
  helpTopic,
  actions = <ProfileMenuButton helpTopic={helpTopic} />,
  subtitle,
  title,
}: {
  actions?: React.ReactNode;
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
      {actions}
    </ToolbarFrame>
  );
}

/**
 * A secondary page's toolbar. Back goes through history, as the iOS edge swipe and Android's back do: to the screen
 * beneath, or to `fallback` when nothing is beneath. A page that must hold or redirect a departure (unsaved work, an
 * open pane) does it with `usePreventRemove`, which every way back passes through.
 */
export function SecondaryToolbar({
  helpTopic,
  actions = <ProfileMenuButton helpTopic={helpTopic} />,
  avatar,
  badge,
  fallback,
  subtitle,
  title,
}: {
  actions?: React.ReactNode;
  helpTopic?: HelpTopic;
  avatar?: React.ReactNode;
  badge?: React.ReactNode;
  fallback: Href;
  subtitle: string;
  title: string;
}) {
  const goBack = useGoBack(fallback);
  return (
    <ToolbarFrame bordered>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        className="h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
        onPress={goBack}
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
      {actions}
    </ToolbarFrame>
  );
}

function ToolbarFrame({ bordered = false, children }: { bordered?: boolean; children: React.ReactNode }) {
  return (
    <View
      className={`min-h-16 w-full flex-row items-center gap-2 bg-background px-4 ${
        bordered ? 'border-b border-border' : ''
      }`}
      style={{ minHeight: 64, paddingVertical: TOOLBAR_INSET }}
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
