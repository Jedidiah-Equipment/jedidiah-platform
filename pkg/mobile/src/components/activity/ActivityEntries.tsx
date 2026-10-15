import { type ActivityEventPresentation, statusBadgeColorClassNames } from '@pkg/domain';
import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useColorMode } from '@/theme/use-color-mode';
import { ActivityEntryShell, ActivityEventMarker, ActivityNoteMarker } from './ActivityEntryShell';

const NOTE_CLAMP_CHARACTERS = 180;

/**
 * What was said, in either business's feed: a filled node, the author's face, and a bubble whose tail points back at
 * them. `footer` names where it was said when the feed is not already there.
 */
export function ActivityNoteEntry({
  author,
  footer,
  last,
  occurredAt,
  text,
}: {
  author: { name: string; thumbnailDataUrl: string | null };
  footer?: ReactNode;
  last: boolean;
  occurredAt: string;
  text: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandable = text.length > NOTE_CLAMP_CHARACTERS;
  return (
    <ActivityEntryShell
      last={last}
      marker={<ActivityNoteMarker />}
      occurredAt={occurredAt}
      who={
        <View accessible accessibilityLabel={author.name}>
          <Avatar
            className="h-7 w-7 rounded-full"
            name={author.name}
            textClassName="text-[9px]"
            uri={author.thumbnailDataUrl}
          />
        </View>
      }
    >
      <View className="relative min-w-0">
        <View className="absolute -left-1 top-3 h-3 w-3 rotate-45 border-b border-l border-border bg-surface" />
        <View className="overflow-hidden rounded-xl border border-border bg-surface">
          <Text className="px-3 pt-2 text-xs text-muted-foreground" weight="semibold">
            {author.name}
          </Text>
          <Text
            className="px-3 pb-2.5 pt-0.5 text-sm leading-5 text-surface-foreground"
            // Never clamp without a toggle: short text can still run long at narrow widths or large text sizes.
            {...(expandable && !expanded ? { numberOfLines: 4 } : {})}
          >
            {text}
          </Text>
          {expandable ? (
            <Pressable className="self-start px-3 pb-2" onPress={() => setExpanded((value) => !value)}>
              <Text className="text-xs text-primary" weight="semibold">
                {expanded ? 'Show less' : 'Show more'}
              </Text>
            </Pressable>
          ) : null}
          {footer}
        </View>
      </View>
    </ActivityEntryShell>
  );
}

/** The strip under a note naming the record it was said on; a link to it when `href` is given. */
export function ActivityNoteFooter({
  accessibilityHint,
  accessibilityLabel,
  children,
  href,
}: {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  children: ReactNode;
  href?: Href | null;
}) {
  const className = 'min-w-0 flex-row items-center gap-1.5 border-t border-border bg-muted/50 px-2.5 py-1.5';
  return href ? (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="link"
      className={`${className} active:bg-muted`}
      onPress={() => router.push(href)}
    >
      {children}
    </Pressable>
  ) : (
    <View className={className}>{children}</View>
  );
}

/**
 * What was done, flat beside a hollow node: the record's icon in its tone, who did what, an optional `context` line
 * naming the record when the sentence does not, and the fact beyond it. With `href`, the entry opens that record.
 */
export function ActivityEventEntry({
  accessibilityHint,
  accessibilityLabel,
  context,
  href,
  icon,
  last,
  occurredAt,
  presentation,
}: {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  context?: ReactNode;
  href?: Href | null;
  icon: TablerIcon;
  last: boolean;
  occurredAt: string;
  presentation: ActivityEventPresentation;
}) {
  const { resolved } = useColorMode();
  const tone = statusBadgeColorClassNames[presentation.tone];
  const content = (
    <>
      <Text className="text-sm leading-5 text-foreground" numberOfLines={3}>
        <Text weight="semibold">{presentation.actorName}</Text> {presentation.sentence}
      </Text>
      {context}
      {presentation.detail === null ? null : (
        <Text className="mt-0.5 text-xs leading-4 text-muted-foreground" numberOfLines={2}>
          {presentation.detail}
        </Text>
      )}
    </>
  );
  return (
    <ActivityEntryShell
      last={last}
      marker={<ActivityEventMarker />}
      occurredAt={occurredAt}
      who={
        // A record, not a person: a rounded square.
        <View className={`h-7 w-7 items-center justify-center rounded-lg border ${tone.chip}`}>
          <Icon className={tone.textByScheme[resolved]} icon={icon} size={13} strokeWidth={1.8} />
        </View>
      }
    >
      {href ? (
        <Pressable
          accessibilityHint={accessibilityHint}
          accessibilityLabel={accessibilityLabel ?? `${presentation.actorName} ${presentation.sentence}`}
          accessibilityRole="button"
          className="min-w-0 flex-1 rounded-lg px-1 active:bg-muted"
          onPress={() => router.push(href)}
        >
          {content}
        </Pressable>
      ) : (
        <View className="min-w-0 flex-1 px-1">{content}</View>
      )}
    </ActivityEntryShell>
  );
}
