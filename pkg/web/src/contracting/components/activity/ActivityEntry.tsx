import { type ActivityNoteItem, isActivityNote, presentActivityEvent } from '@pkg/domain/contracting';
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
  type TablerIcon,
} from '@tabler/icons-react';
import { Link, type LinkProps } from '@tanstack/react-router';

import {
  ActivityEventEntry,
  ActivityNoteEntry,
  ActivityNoteFooter,
  activityNoteFooterLinkClassName,
} from '@/components/activity/ActivityEntries.js';
import { activityEntryLinkClassName } from '@/components/activity/ActivityEntryShell.js';
import { cn } from '@/lib/utils.js';

/**
 * The thread an entry sits in (a link back to that same Job or Breakdown would go nowhere), and whether this reader
 * opens the Job page: the workshop reads Jobs' Activity through its Workshop reach, and a Foreman's Jobs live on the
 * phone.
 */
export type ActivityScope = { jobId?: string | undefined; breakdownId?: string | undefined; canOpenJob: boolean };

type EntryTarget = { label: string; link: Pick<LinkProps, 'params' | 'to'> | null };

/**
 * What an entry points at: its Breakdown when it has one, else its Job. Null inside that same thread; `link` null for a
 * Job this reader does not open, so the entry still names it without a dead link.
 */
function entryTarget(item: ActivityItem, scope: ActivityScope): EntryTarget | null {
  if ('breakdown' in item) {
    if (scope.breakdownId === item.breakdown.id) return null;
    return {
      label: item.job ? `${item.breakdown.subject.code} · ${item.job.jobNumber}` : item.breakdown.subject.code,
      link: { to: '/contracting/workshop/$id', params: { id: item.breakdown.id } },
    };
  }
  if (scope.jobId === item.job.id) return null;
  return {
    label: `${item.job.jobNumber} · ${item.job.farmName}`,
    link: scope.canOpenJob ? { to: '/contracting/jobs/$code', params: { code: item.job.jobNumber } } : null,
  };
}

/** One Contracting feed entry: a note as a bubble from its author, every other item as one sentence. */
export function ActivityEntry({ item, scope }: { item: ActivityItem; scope: ActivityScope }) {
  const target = entryTarget(item, scope);
  return isActivityNote(item) ? (
    <ActivityNoteEntry
      author={item.actor}
      footer={target ? <NoteFooter target={target} /> : null}
      occurredAt={item.occurredAt}
      text={item.text}
    />
  ) : (
    <ActivityEventEntry
      icon={EVENT_ICONS[item.type]}
      link={
        target?.link ? (
          <Link {...target.link} aria-label={`Open ${target.label}`} className={activityEntryLinkClassName} />
        ) : null
      }
      occurredAt={item.occurredAt}
      presentation={presentActivityEvent(item)}
    />
  );
}

function NoteFooter({ target }: { target: EntryTarget }) {
  return (
    <ActivityNoteFooter>
      {target.link ? (
        <Link
          {...target.link}
          aria-label={`Open ${target.label}`}
          className={cn('font-mono', activityNoteFooterLinkClassName)}
        >
          {target.label}
        </Link>
      ) : (
        <span className="font-mono">{target.label}</span>
      )}
    </ActivityNoteFooter>
  );
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
