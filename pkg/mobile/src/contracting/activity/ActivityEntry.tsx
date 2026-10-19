import {
  type ActivityNoteItem,
  activityEntryRecord,
  isActivityNote,
  presentActivityEvent,
} from '@pkg/domain/contracting';
import type { ActivityItem, ActivityItemType, ActivityJobRef, NoteThreadKind } from '@pkg/schema/contracting';
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
import type { Href } from 'expo-router';
import { ActivityEventEntry, ActivityNoteEntry, ActivityNoteFooter } from '@/components/activity/ActivityEntries';
import { Text } from '@/components/ui/text';

/** The record whose thread the feed shows, when it shows one. */
export type ActivityThreadRef = { kind: NoteThreadKind; id: string };

/**
 * The thread an entry sits in (a link back to that same Job or Breakdown would go nowhere), and whether this person's
 * phone opens a Job: the workshop reads every Job's Activity but has no Job screen.
 */
export type ActivityScope = { thread?: ActivityThreadRef; canOpenJob: (job: ActivityJobRef) => boolean };

/** One Contracting feed entry: a note as a bubble from its author, every other item as one sentence. */
export function ActivityEntry({ item, last, scope }: { item: ActivityItem; last: boolean; scope: ActivityScope }) {
  const target = entryTarget(item, scope);
  return isActivityNote(item) ? (
    <ActivityNoteEntry
      author={item.actor}
      footer={
        target ? (
          <ActivityNoteFooter accessibilityLabel={`Open ${target.label}`} href={target.href}>
            <Text className="text-[11px] text-muted-foreground" mono numberOfLines={1}>
              {target.label}
            </Text>
          </ActivityNoteFooter>
        ) : null
      }
      last={last}
      occurredAt={item.occurredAt}
      text={item.text}
    />
  ) : (
    <ActivityEventEntry
      accessibilityHint="Opens the record"
      href={target?.href ?? null}
      icon={EVENT_ICONS[item.type]}
      last={last}
      occurredAt={item.occurredAt}
      presentation={presentActivityEvent(item)}
    />
  );
}

/** The record's screen, by kind; `href` null for a Job this phone does not open, so the entry still names it. */
function entryTarget(item: ActivityItem, scope: ActivityScope): { href: Href | null; label: string } | null {
  const record = activityEntryRecord(item, scope.thread);
  if (!record) return null;
  // A note opens on its thread, where the reply goes; an event opens on the record's Details.
  const tab = isActivityNote(item) ? { tab: 'activity' } : {};
  switch (record.kind) {
    case 'breakdown':
      return {
        href: { pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: record.id, ...tab } } as Href,
        label: record.label,
      };
    case 'job':
      return {
        href: scope.canOpenJob(record.job)
          ? ({ pathname: '/contracting/jobs/[jobId]', params: { jobId: record.id, ...tab } } as Href)
          : null,
        label: record.label,
      };
  }
}

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
