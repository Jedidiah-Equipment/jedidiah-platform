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
  type TablerIcon,
} from '@tabler/icons-react';
import { Link, type LinkProps } from '@tanstack/react-router';

import {
  ActivityEntryShell,
  ActivityEventMarker,
  ActivityNoteMarker,
  activityEntryLinkClassName,
} from '@/components/activity/ActivityEntryShell.js';
import { ActivityNoteBubble } from '@/components/activity/ActivityNoteBubble.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
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
  return isActivityNote(item) ? (
    <NoteEntry item={item} target={entryTarget(item, scope)} />
  ) : (
    <EventEntry item={item} target={entryTarget(item, scope)} />
  );
}

function NoteEntry({ item, target }: { item: ActivityNoteItem; target: EntryTarget | null }) {
  return (
    <ActivityEntryShell
      marker={<ActivityNoteMarker />}
      occurredAt={item.occurredAt}
      who={
        <EntityThumbnail
          className="z-10"
          label={item.actor.name}
          shape="circle"
          thumbnailDataUrl={item.actor.thumbnailDataUrl}
        />
      }
    >
      <ActivityNoteBubble
        footer={target ? <NoteFooter target={target} /> : null}
        header={<p className="px-3.5 pt-2.5 -mb-2 font-medium text-muted-foreground text-xs">{item.actor.name}</p>}
        text={item.text}
      />
    </ActivityEntryShell>
  );
}

function NoteFooter({ target }: { target: EntryTarget }) {
  const className = 'block border-t border-border/70 bg-muted/40 px-3.5 py-1.5 font-mono text-muted-foreground text-xs';
  return target.link ? (
    <Link
      {...target.link}
      aria-label={`Open ${target.label}`}
      className={cn(className, 'relative z-10 transition-colors hover:bg-muted hover:text-foreground')}
    >
      {target.label}
    </Link>
  ) : (
    <p className={className}>{target.label}</p>
  );
}

function EventEntry({ item, target }: { item: ActivityEventItem; target: EntryTarget | null }) {
  const presentation = presentActivityEvent(item);
  const tone = statusBadgeColorClassNames[TONE_COLOUR[presentation.tone]];
  const Icon = EVENT_ICONS[item.type];
  return (
    <ActivityEntryShell
      dense
      link={
        target?.link ? (
          <Link {...target.link} aria-label={`Open ${target.label}`} className={activityEntryLinkClassName} />
        ) : null
      }
      marker={<ActivityEventMarker />}
      occurredAt={item.occurredAt}
      who={
        // A record, not a person: a rounded square.
        <span className={cn('flex size-8 items-center justify-center rounded-lg border', tone.chip, tone.text)}>
          <Icon aria-hidden className="size-3.5" />
        </span>
      }
    >
      <div className="min-w-0">
        <p className="text-sm leading-6">{presentation.sentence}</p>
        {presentation.detail === null ? null : (
          <p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{presentation.detail}</p>
        )}
      </div>
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
