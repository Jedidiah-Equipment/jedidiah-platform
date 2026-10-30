import type { AppPermission, UserAccessSummary, UUID } from '@pkg/schema';
import type {
  ActivityFilter,
  ActivityItem,
  ActivityItemType,
  ActivityJobRef,
  NoteThreadKind,
} from '@pkg/schema/contracting';
import type { ActivityEventPresentation } from '../activity/presentation.js';
import { hasPermission } from '../auth/authorization.js';
import { formatHours } from '../formatting/number.js';
import { getFirstName } from '../formatting/text.js';
import { breakdownUrgencyLabels } from './breakdowns.js';

export const activityFilterLabels: Record<ActivityFilter, string> = {
  all: 'All',
  notes: 'Notes',
  breakdowns: 'Breakdowns',
  jobs: 'Jobs',
  hours: 'Hours',
};

/** The filter each item answers to; `all` holds every one. */
export const activityItemCategory: Record<ActivityItemType, Exclude<ActivityFilter, 'all'>> = {
  'job-note': 'notes',
  'breakdown-note': 'notes',
  'breakdown-reported': 'breakdowns',
  'mechanic-assigned': 'breakdowns',
  'breakdown-started': 'breakdowns',
  'breakdown-solved': 'breakdowns',
  'job-started': 'jobs',
  'job-completed': 'jobs',
  'job-cancelled': 'jobs',
  'machine-arrived': 'hours',
  'machine-left': 'hours',
};

/**
 * Who may open Activity at all: a Jobs reach (work any Job, or read one's own) or a Workshop reach (read every
 * Breakdown, or report one's own). The API, the phone tab, the web route and the web nav all ask this one rule.
 */
export const activityPermissions = [
  'contracting_job:work-any',
  'contracting_job:read-own',
  'contracting_breakdown:read',
  'contracting_breakdown:report',
] as const satisfies readonly [AppPermission, ...AppPermission[]];

export const canSeeActivity = (access: UserAccessSummary | null | undefined) =>
  activityPermissions.some((permission) => hasPermission(access, permission));

export type ActivityNoteItem = Extract<ActivityItem, { type: 'job-note' | 'breakdown-note' }>;
export type ActivityEventItem = Exclude<ActivityItem, ActivityNoteItem>;

export const isActivityNote = (item: ActivityItem): item is ActivityNoteItem =>
  item.type === 'job-note' || item.type === 'breakdown-note';

/** The record an entry points at, named the way its footer or link reads it. */
export type ActivityEntryRecord =
  | { kind: 'breakdown'; id: UUID; label: string; job: ActivityJobRef | null }
  | { kind: 'job'; id: UUID; label: string; job: ActivityJobRef };

/**
 * What an entry points at: its Breakdown when it has one, else its Job. Null inside that same thread, where a link
 * back would go nowhere; a Job's thread holds its Breakdowns' entries too, and those still point at their Breakdown.
 */
export function activityEntryRecord(
  item: ActivityItem,
  thread?: { kind: NoteThreadKind; id: string },
): ActivityEntryRecord | null {
  if ('breakdown' in item) {
    if (thread?.kind === 'breakdown' && thread.id === item.breakdown.id) return null;
    return {
      kind: 'breakdown',
      id: item.breakdown.id,
      label: item.job ? `${item.breakdown.subject.code} · ${item.job.jobNumber}` : item.breakdown.subject.code,
      job: item.job,
    };
  }
  if (thread?.kind === 'job' && thread.id === item.job.id) return null;
  return { kind: 'job', id: item.job.id, label: `${item.job.jobNumber} · ${item.job.farmName}`, job: item.job };
}

const at = (job: ActivityJobRef | null) => (job ? ` at ${job.jobNumber}` : '');

/** What an event item says; notes render as bubbles and never come here. */
export function presentActivityEvent(item: ActivityEventItem): ActivityEventPresentation {
  const actorName = getFirstName(item.actor.name);
  switch (item.type) {
    case 'breakdown-reported':
      return {
        actorName,
        sentence: `reported ${breakdownUrgencyLabels[item.breakdown.urgency]} on ${item.breakdown.subject.code}${at(item.job)}`,
        detail: item.firstLine,
        tone: item.breakdown.urgency === 'code-red' ? 'red' : 'orange',
      };
    case 'mechanic-assigned':
      return {
        actorName,
        sentence: item.mechanicName
          ? `assigned ${getFirstName(item.mechanicName)} to ${item.breakdown.subject.code}`
          : `cleared the Mechanic on ${item.breakdown.subject.code}`,
        detail: null,
        tone: 'green',
      };
    case 'breakdown-started':
      return { actorName, sentence: `started fixing ${item.breakdown.subject.code}`, detail: null, tone: 'blue' };
    case 'breakdown-solved':
      return {
        actorName,
        sentence: `marked ${item.breakdown.subject.code} Fixed`,
        detail: item.closeOutNote,
        tone: 'purple',
      };
    case 'job-started':
      return {
        actorName,
        sentence: `started ${item.job.jobNumber} at ${item.job.farmName}`,
        detail: `${item.machine.code} arrived`,
        tone: 'blue',
      };
    case 'job-completed':
      return { actorName, sentence: `signed off ${item.job.jobNumber}`, detail: null, tone: 'purple' };
    case 'job-cancelled':
      return { actorName, sentence: `cancelled ${item.job.jobNumber}`, detail: item.reason, tone: 'gray' };
    case 'machine-arrived':
      return {
        actorName,
        sentence: `put ${item.machine.code} on site at ${item.job.jobNumber}`,
        detail: formatHours(item.hours),
        tone: 'blue',
      };
    case 'machine-left':
      return {
        actorName,
        sentence: `took ${item.machine.code} off site at ${item.job.jobNumber}`,
        detail: formatHours(item.hours),
        tone: 'gray',
      };
  }
}
