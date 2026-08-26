import type {
  DateIso,
  JobChangeActivityItem,
  JobWorkTimeActivityAction,
  JobWorkTimeActivityState,
  WorkItemDepartment,
} from '@pkg/schema';

import { departmentLabels } from '../departments.js';
import type { StatusBadgeColor } from '../theme/status-badge.js';

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

/** Crew context that adds information beyond the activity timeline's own date and event sentence. */
export function jobWorkTimeActivityDetail(timing: JobWorkTimeActivityState | null): string | null {
  return timing && timing.crew.length > 0 ? timing.crew.join(', ') : null;
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
