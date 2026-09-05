import { type DateIso, DateOnlyIso } from '@pkg/schema';
import type {
  JobActivityItem,
  JobChangeActivityItem,
  JobWorkTimeActivityAction,
  JobWorkTimeActivityState,
  WorkItemDepartment,
} from '@pkg/schema/equipment';
import { isSameDay, isSameYear, subDays } from 'date-fns';
import { formatDate, parseDate, toPlantDateOnly } from '../../formatting/date.js';
import { getFirstName } from '../../formatting/text.js';
import type { StatusBadgeColor } from '../../theme/status-badge.js';
import { departmentLabels } from '../departments.js';

export const JOB_ACTIVITY_EVENT_SENTENCES = {
  completed: 'completed this Job',
  created: 'created this Job',
  descriptionChanged: 'changed the Job description',
  descriptionCleared: 'cleared the Job description',
  documentAdded: 'added a document',
} as const;

/** One category tone across web and mobile; event-specific icons carry the finer distinction. */
const jobActivityEventTone = {
  'job-completed': 'purple',
  'job-created': 'purple',
  'job-description-updated': 'purple',
  'job-document-added': 'purple',
  'job-work-time-updated': 'blue',
} as const satisfies Record<JobChangeActivityItem['type'], StatusBadgeColor>;

export type JobActivityEventPresentation = {
  actorName: string;
  /** The fact beyond the event sentence, or null when there is no additional detail. */
  detail: string | null;
  sentence: string;
  tone: StatusBadgeColor;
};

/** Shared event wording and context; each app supplies its own icons and layout. */
export function presentJobActivityEvent(item: JobChangeActivityItem): JobActivityEventPresentation {
  const attribution = {
    // A system action and a deleted actor both leave a null actor, as in the Audit table.
    actorName: item.actor ? getFirstName(item.actor.name) : 'System',
    tone: jobActivityEventTone[item.type],
  };

  switch (item.type) {
    case 'job-created':
      return { ...attribution, detail: null, sentence: JOB_ACTIVITY_EVENT_SENTENCES.created };
    case 'job-description-updated':
      return {
        ...attribution,
        detail: item.description,
        sentence:
          item.description === null
            ? JOB_ACTIVITY_EVENT_SENTENCES.descriptionCleared
            : JOB_ACTIVITY_EVENT_SENTENCES.descriptionChanged,
      };
    case 'job-completed':
      return {
        ...attribution,
        detail: jobCompletionActivityDetail(item),
        sentence: JOB_ACTIVITY_EVENT_SENTENCES.completed,
      };
    case 'job-document-added':
      return {
        ...attribution,
        detail: item.document.filename,
        sentence: JOB_ACTIVITY_EVENT_SENTENCES.documentAdded,
      };
    case 'job-work-time-updated':
      return {
        ...attribution,
        detail: jobWorkTimeActivityDetail(item),
        sentence: jobWorkTimeActivitySentence(item),
      };
  }
}

export function jobWorkTimeActivitySentence({
  action,
  department,
}: {
  action: JobWorkTimeActivityAction;
  department: WorkItemDepartment;
}): string {
  const departmentLabel = departmentLabels[department];

  switch (action) {
    case 'started':
      return `started ${departmentLabel} work`;
    case 'completed':
      return `completed ${departmentLabel} work`;
    case 'corrected':
      return `corrected ${departmentLabel} work times`;
    case 'cleared':
      return `cleared ${departmentLabel} work times`;
  }
}

/** Completion dates are plant business dates, even when the reader's timeline day differs. */
function jobCompletionActivityDetail({
  completedOn,
  occurredAt,
}: {
  completedOn: DateOnlyIso;
  occurredAt: DateIso;
}): string | null {
  return completedOn === toPlantDateOnly(new Date(occurredAt)) ? null : formatDate(completedOn);
}

/** Non-redundant Work Time context beyond the activity timeline's own date and event sentence. */
function jobWorkTimeActivityDetail({
  action,
  timing,
}: {
  action: JobWorkTimeActivityAction;
  timing: JobWorkTimeActivityState | null;
}): string | null {
  if (timing === null) return null;

  const crew = timing.crew.join(', ');
  if (action !== 'corrected') return crew || null;

  const span = timing.completedAt
    ? `${formatDate(timing.startedAt)} → ${formatDate(timing.completedAt)}`
    : formatDate(timing.startedAt);

  return crew ? `${span} · ${crew}` : span;
}

/** Whether the newest feed entry lies beyond the user's Activity high-water mark. */
export function hasUnreadActivity({
  lastActivitySeen,
  latestActivityAt,
}: {
  lastActivitySeen: DateIso;
  latestActivityAt: DateIso | null;
}): boolean {
  return latestActivityAt !== null && Date.parse(latestActivityAt) > Date.parse(lastActivitySeen);
}

/** One calendar day of the feed, in the order the feed delivered it. */
export type JobActivityDayGroup = {
  /** The reader's local calendar day, `yyyy-MM-dd` — the group's identity and React key. */
  day: DateOnlyIso;
  items: JobActivityItem[];
  label: string;
};

/**
 * Split the feed into day headings. The API already sorts by `occurredAt`, so a day is a consecutive
 * run rather than a bucket to collect: entries keep the order they arrived in, and a page boundary
 * landing mid-day extends that day's group instead of opening a second heading for it.
 */
export function groupJobActivityByDay(
  items: readonly JobActivityItem[],
  now: Date = new Date(),
): JobActivityDayGroup[] {
  const groups: JobActivityDayGroup[] = [];

  for (const item of items) {
    const day = DateOnlyIso.parse(formatDate(item.occurredAt, 'yyyy-MM-dd'));
    const openGroup = groups.at(-1);

    if (openGroup?.day === day) {
      openGroup.items.push(item);
      continue;
    }

    groups.push({ day, items: [item], label: formatJobActivityDayLabel(item.occurredAt, now) });
  }

  return groups;
}

/**
 * The heading over a day's entries. Today and Yesterday are named as well as dated: the weekday is
 * what places an entry in the reader's week, but the two most-read days should not have to be
 * counted back to. The year only appears once it is no longer the obvious one.
 */
function formatJobActivityDayLabel(occurredAt: DateIso, now: Date): string {
  const date = parseDate(occurredAt);

  if (!date) {
    return '';
  }

  const dayLabel = formatDate(date, isSameYear(date, now) ? 'EEE d MMM' : 'EEE d MMM yyyy');

  if (isSameDay(date, now)) {
    return `Today · ${dayLabel}`;
  }

  if (isSameDay(date, subDays(now, 1))) {
    return `Yesterday · ${dayLabel}`;
  }

  return dayLabel;
}
