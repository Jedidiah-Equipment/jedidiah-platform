import type { AppPermission, UserAccessSummary } from '@pkg/schema';
import type { ActivityFilter, ActivityItem, ActivityItemType, ActivityJobRef } from '@pkg/schema/contracting';
import type { ActivityEventPresentation } from '../activity/presentation.js';
import { hasPermission } from '../auth/authorization.js';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
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

const at = (job: ActivityJobRef | null) => (job ? ` at ${job.jobNumber}` : '');

/** A Read At more than this far from acceptance was backdated, so the detail names it. */
const READ_AT_TOLERANCE_MS = 60_000;

/** The hours, plus the Read At when it differs from the accepted instant by more than a minute. */
function hoursDetail(item: { hours: number; readAt: string; occurredAt: string; photoBacked: boolean }): string {
  const parts = [formatHours(item.hours)];
  if (Math.abs(Date.parse(item.readAt) - Date.parse(item.occurredAt)) > READ_AT_TOLERANCE_MS)
    parts.push(`read ${formatDate(item.readAt, 'medium')}`);
  if (item.photoBacked) parts.push('photo');
  return parts.join(' · ');
}

/** What an event item says; notes render as bubbles and never come here. */
export function presentActivityEvent(item: ActivityEventItem): ActivityEventPresentation {
  const actorName = item.actor.name;
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
          ? `assigned ${item.mechanicName} to ${item.breakdown.subject.code}`
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
        detail: hoursDetail(item),
        tone: 'blue',
      };
    case 'machine-left':
      return {
        actorName,
        sentence: `took ${item.machine.code} off site at ${item.job.jobNumber}`,
        detail: hoursDetail(item),
        tone: 'gray',
      };
  }
}
