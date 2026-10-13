import { statusBadgeColorClassNames } from '@pkg/domain';
import {
  type ActivityEventItem,
  type ActivityEventTone,
  type ActivityNoteItem,
  isActivityNote,
  presentActivityEvent,
} from '@pkg/domain/contracting';
import type { ActivityItem, ActivityItemType } from '@pkg/schema/contracting';
import {
  IconArrowBarToDown,
  IconArrowBarUp,
  IconChecks,
  IconCircleCheck,
  IconFlagFilled,
  IconPlayerPlay,
  IconTool,
  IconUserCheck,
  IconX,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { ActivityEntryShell } from '@/components/activity/ActivityEntryShell';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useColorMode } from '@/theme/use-color-mode';

/** The thread an entry sits in: a link back to that same Job or Breakdown would go nowhere. */
export type ActivityScope = { jobId?: string; breakdownId?: string };

const NOTE_CLAMP_CHARACTERS = 180;

export function ActivityEntry({ item, last, scope }: { item: ActivityItem; last: boolean; scope: ActivityScope }) {
  return isActivityNote(item) ? (
    <NoteEntry item={item} last={last} scope={scope} />
  ) : (
    <EventEntry item={item} last={last} scope={scope} />
  );
}

/** Where tapping an entry goes: its Breakdown when it has one, else its Job; null inside that same thread. */
function entryTarget(item: ActivityItem, scope: ActivityScope): { href: Href; label: string } | null {
  if ('breakdown' in item) {
    if (scope.breakdownId === item.breakdown.id) return null;
    return {
      href: { pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: item.breakdown.id } } as Href,
      label: item.job ? `${item.breakdown.subject.code} · ${item.job.jobNumber}` : item.breakdown.subject.code,
    };
  }
  if (scope.jobId === item.job.id) return null;
  return {
    href: { pathname: '/contracting/jobs/[jobId]', params: { jobId: item.job.id } } as Href,
    label: `${item.job.jobNumber} · ${item.job.farmName}`,
  };
}

function NoteEntry({ item, last, scope }: { item: ActivityNoteItem; last: boolean; scope: ActivityScope }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = item.text.length > NOTE_CLAMP_CHARACTERS;
  const target = entryTarget(item, scope);
  return (
    <ActivityEntryShell
      last={last}
      marker={<View className="h-2 w-2 rounded-full bg-primary" />}
      occurredAt={item.occurredAt}
      who={
        <View accessible accessibilityLabel={item.actor.name}>
          <Avatar
            className="h-7 w-7 rounded-full"
            name={item.actor.name}
            textClassName="text-[9px]"
            uri={item.actor.thumbnailDataUrl}
          />
        </View>
      }
    >
      <View className="relative min-w-0">
        <View className="absolute -left-1 top-3 h-3 w-3 rotate-45 border-b border-l border-border bg-surface" />
        <View className="overflow-hidden rounded-xl border border-border bg-surface">
          <Text className="px-3 pt-2 text-xs text-muted-foreground" weight="semibold">
            {item.actor.name}
          </Text>
          <Text
            className="px-3 pb-2.5 pt-0.5 text-sm leading-5 text-surface-foreground"
            // Never clamp without a toggle: short text can still run long at narrow widths or large text sizes.
            {...(expandable && !expanded ? { numberOfLines: 4 } : {})}
          >
            {item.text}
          </Text>
          {expandable ? (
            <Pressable className="self-start px-3 pb-2" onPress={() => setExpanded((value) => !value)}>
              <Text className="text-xs text-primary" weight="semibold">
                {expanded ? 'Show less' : 'Show more'}
              </Text>
            </Pressable>
          ) : null}
          {target ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${target.label}`}
              className="border-t border-border bg-muted/50 px-2.5 py-1.5 active:bg-muted"
              onPress={() => router.push(target.href)}
            >
              <Text className="text-[11px] text-muted-foreground" mono numberOfLines={1}>
                {target.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ActivityEntryShell>
  );
}

function EventEntry({ item, last, scope }: { item: ActivityEventItem; last: boolean; scope: ActivityScope }) {
  const { resolved } = useColorMode();
  const presentation = presentActivityEvent(item);
  const tone = statusBadgeColorClassNames[TONE_COLOUR[presentation.tone]];
  const target = entryTarget(item, scope);
  const content = (
    <>
      <Text className="text-sm leading-5 text-foreground" numberOfLines={3}>
        {presentation.sentence}
      </Text>
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
      marker={<View className="h-2 w-2 rounded-full border border-muted-foreground bg-background" />}
      occurredAt={item.occurredAt}
      who={
        // A record, not a person: a rounded square.
        <View className={`h-7 w-7 items-center justify-center rounded-lg border ${tone.chip}`}>
          <Icon className={tone.textByScheme[resolved]} icon={EVENT_ICONS[item.type]} size={13} strokeWidth={1.8} />
        </View>
      }
    >
      {target ? (
        <Pressable
          accessibilityHint="Opens the record"
          accessibilityLabel={presentation.sentence}
          accessibilityRole="button"
          className="min-w-0 flex-1 rounded-lg px-1 active:bg-muted"
          onPress={() => router.push(target.href)}
        >
          {content}
        </Pressable>
      ) : (
        <View className="min-w-0 flex-1 px-1">{content}</View>
      )}
    </ActivityEntryShell>
  );
}

const TONE_COLOUR = {
  danger: 'red',
  warning: 'orange',
  next: 'green',
  'in-progress': 'blue',
  done: 'purple',
  muted: 'gray',
} as const satisfies Record<ActivityEventTone, keyof typeof statusBadgeColorClassNames>;

const EVENT_ICONS = {
  'breakdown-reported': IconFlagFilled,
  'mechanic-assigned': IconUserCheck,
  'breakdown-started': IconTool,
  'breakdown-solved': IconCircleCheck,
  'job-started': IconPlayerPlay,
  'job-completed': IconChecks,
  'job-cancelled': IconX,
  'machine-arrived': IconArrowBarToDown,
  'machine-left': IconArrowBarUp,
} satisfies Record<Exclude<ActivityItemType, ActivityNoteItem['type']>, TablerIcon>;
