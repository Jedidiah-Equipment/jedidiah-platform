import type { DateIso, JobWorkTimeActivityAction, JobWorkTimeActivityState, WorkItemDepartment } from '@pkg/schema';

import { departmentLabels } from '../departments.js';
import { formatDate } from '../formatting/date.js';

export const JOB_ACTIVITY_EVENT_SENTENCES = {
  completed: 'completed this Job',
  created: 'created this Job',
  descriptionChanged: 'changed the Job description',
  descriptionCleared: 'cleared the Job description',
  documentAdded: 'added a document',
} as const;

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

/** The observed span and crew carried by a Work Time event, independent of its audit timestamp. */
export function jobWorkTimeActivityDetail(timing: JobWorkTimeActivityState | null): string | null {
  if (timing === null) return null;

  const span = `${formatDate(timing.startedAt)} → ${formatDate(timing.completedAt, 'short', 'In progress')}`;

  return timing.crew.length === 0 ? span : `${span} · ${timing.crew.join(', ')}`;
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
