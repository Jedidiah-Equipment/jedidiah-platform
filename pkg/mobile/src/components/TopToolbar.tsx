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
 * How a secondary page goes back. `fallback` is history first: back to the screen beneath, as the iOS edge swipe goes,
 * and to `fallback` only when nothing is beneath; `backDisabled` holds it while the page is busy. `onBack` is a fixed
 * named parent, for pages whose tab has not moved to history yet.
 */
type SecondaryBack =
  | { fallback: Href; backDisabled?: boolean; onBack?: never; parentLabel?: never }
  | { onBack: () => void; parentLabel: string; fallback?: never; backDisabled?: never };

export function SecondaryToolbar({
  helpTopic,
  actions = <ProfileMenuButton helpTopic={helpTopic} />,
  avatar,
  badge,
  subtitle,
  title,
  ...back
}: {
  actions?: React.ReactNode;
  helpTopic?: HelpTopic;
  avatar?: React.ReactNode;
  badge?: React.ReactNode;
  subtitle: string;
  title: string;
} & SecondaryBack) {
  return (
    <ToolbarFrame bordered>
      {back.fallback === undefined ? (
        <BackButton label={`Back to ${back.parentLabel}`} onPress={back.onBack} />
      ) : (
        <HistoryBackButton disabled={back.backDisabled ?? false} fallback={back.fallback} />
      )}
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

function HistoryBackButton({ disabled, fallback }: { disabled: boolean; fallback: Href }) {
  const goBack = useGoBack(fallback);
  return (
    <BackButton
      label="Back"
      onPress={() => {
        if (!disabled) goBack();
      }}
    />
  );
}

function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
      onPress={onPress}
    >
      <Icon icon={IconChevronLeft} size={20} />
    </Pressable>
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
