import type { DateIso, DateOnlyIso } from '@pkg/schema';
import type {
  JobChangeActivityItem,
  JobWorkTimeActivityAction,
  JobWorkTimeActivityState,
  WorkItemDepartment,
} from '@pkg/schema/equipment';
import { formatDate, toPlantDateOnly } from '../../formatting/date.js';
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
export const jobActivityEventTone = {
  'job-completed': 'purple',
  'job-created': 'purple',
  'job-description-updated': 'purple',
  'job-document-added': 'purple',
  'job-work-time-updated': 'blue',
} as const satisfies Record<JobChangeActivityItem['type'], StatusBadgeColor>;

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

/** A backdated completion remains visible; the usual same-day date stays on the timeline only. */
export function jobCompletionActivityDetail({
  completedOn,
  occurredAt,
}: {
  completedOn: DateOnlyIso;
  occurredAt: DateIso;
}): string | null {
  return completedOn === toPlantDateOnly(new Date(occurredAt)) ? null : formatDate(completedOn);
}

/** Non-redundant Work Time context beyond the activity timeline's own date and event sentence. */
export function jobWorkTimeActivityDetail({
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
