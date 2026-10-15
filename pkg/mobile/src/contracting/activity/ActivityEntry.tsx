import { type ActivityNoteItem, isActivityNote, presentActivityEvent } from '@pkg/domain/contracting';
import type { ActivityItem, ActivityItemType, ActivityJobRef } from '@pkg/schema/contracting';
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

/**
 * The thread an entry sits in (a link back to that same Job or Breakdown would go nowhere), and whether this person's
 * phone opens a Job: the workshop reads every Job's Activity but has no Job screen.
 */
export type ActivityScope = { jobId?: string; breakdownId?: string; canOpenJob: (job: ActivityJobRef) => boolean };

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

/**
 * What an entry points at: its Breakdown when it has one, else its Job. Null inside that same thread; `href` null for
 * a Job this phone does not open, so the entry still names it without a dead link.
 */
function entryTarget(item: ActivityItem, scope: ActivityScope): { href: Href | null; label: string } | null {
  // A note opens on its thread, where the reply goes; an event opens on the record's Details.
  const tab = isActivityNote(item) ? { tab: 'activity' } : {};
  if ('breakdown' in item) {
    if (scope.breakdownId === item.breakdown.id) return null;
    return {
      href: {
        pathname: '/contracting/workshop/[breakdownId]',
        params: { breakdownId: item.breakdown.id, ...tab },
      } as Href,
      label: item.job ? `${item.breakdown.subject.code} · ${item.job.jobNumber}` : item.breakdown.subject.code,
    };
  }
  if (scope.jobId === item.job.id) return null;
  return {
    href: scope.canOpenJob(item.job)
      ? ({ pathname: '/contracting/jobs/[jobId]', params: { jobId: item.job.id, ...tab } } as Href)
      : null,
    label: `${item.job.jobNumber} · ${item.job.farmName}`,
  };
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
