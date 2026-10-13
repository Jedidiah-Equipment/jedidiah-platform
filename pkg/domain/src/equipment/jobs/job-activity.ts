import { DateIso, type DateOnlyIso } from '@pkg/schema';
import type {
  JobActivityItem,
  JobChangeActivityItem,
  JobWorkTimeActivityAction,
  JobWorkTimeActivityState,
  WorkItemDepartment,
} from '@pkg/schema/equipment';
import { type ActivityDayGroup, groupActivityByDay } from '../../activity/day-groups.js';
import { formatDate, toPlantDateOnly } from '../../formatting/date.js';
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

export { hasUnreadActivity } from '../../activity/activity-view.js';

/** One calendar day of the feed, in the order the feed delivered it. */
export type JobActivityDayGroup = ActivityDayGroup<JobActivityItem>;

/** Equipment's feed split into day headings; see {@link groupActivityByDay}. */
export const groupJobActivityByDay = (
  items: readonly JobActivityItem[],
  now: DateIso = DateIso.parse(new Date()),
): JobActivityDayGroup[] => groupActivityByDay(items, now);
