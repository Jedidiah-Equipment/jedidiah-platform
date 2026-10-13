import type { UserAccessSummary } from '@pkg/schema';
import type { ActivityFilter, ActivityItem, ActivityItemType, ActivityJobRef } from '@pkg/schema/contracting';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { breakdownReadScope, breakdownUrgencyLabels } from './breakdowns.js';
import { fieldJobAccessMode } from './jobs.js';

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

/** Who may open Activity at all: anyone with a Jobs or a Workshop reach. The API, the phone tab and the web nav all ask this. */
export const canSeeActivity = (access: UserAccessSummary | null | undefined) =>
  fieldJobAccessMode(access) !== null || breakdownReadScope(access) !== null;

/** How an event reads at a glance; each app picks its own icon and colour for it. */
export type ActivityEventTone = 'danger' | 'warning' | 'next' | 'in-progress' | 'done' | 'muted';
export type ActivityEventPresentation = { sentence: string; detail: string | null; tone: ActivityEventTone };
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

/** The one sentence an event item shows; notes render as bubbles and never come here. */
export function presentActivityEvent(item: ActivityEventItem): ActivityEventPresentation {
  switch (item.type) {
    case 'breakdown-reported':
      return {
        sentence: `${item.actor.name} reported ${breakdownUrgencyLabels[item.breakdown.urgency]} on ${item.breakdown.subject.code}${at(item.job)}`,
        detail: item.firstLine,
        tone: item.breakdown.urgency === 'code-red' ? 'danger' : 'warning',
      };
    case 'mechanic-assigned':
      return {
        sentence: item.mechanicName
          ? `${item.actor.name} assigned ${item.mechanicName} to ${item.breakdown.subject.code}`
          : `${item.actor.name} cleared the Mechanic on ${item.breakdown.subject.code}`,
        detail: null,
        tone: 'next',
      };
    case 'breakdown-started':
      return {
        sentence: `${item.actor.name} started fixing ${item.breakdown.subject.code}`,
        detail: null,
        tone: 'in-progress',
      };
    case 'breakdown-solved':
      return {
        sentence: `${item.actor.name} marked ${item.breakdown.subject.code} Fixed`,
        detail: item.closeOutNote,
        tone: 'done',
      };
    case 'job-started':
      return {
        sentence: `${item.job.jobNumber} started at ${item.job.farmName}`,
        detail: `${item.machine.code} arrived · ${item.actor.name}`,
        tone: 'in-progress',
      };
    case 'job-completed':
      return { sentence: `${item.actor.name} signed off ${item.job.jobNumber}`, detail: null, tone: 'done' };
    case 'job-cancelled':
      return { sentence: `${item.actor.name} cancelled ${item.job.jobNumber}`, detail: item.reason, tone: 'muted' };
    case 'machine-arrived':
      return {
        sentence: `${item.actor.name} put ${item.machine.code} on site at ${item.job.jobNumber}`,
        detail: hoursDetail(item),
        tone: 'in-progress',
      };
    case 'machine-left':
      return {
        sentence: `${item.actor.name} took ${item.machine.code} off site at ${item.job.jobNumber}`,
        detail: hoursDetail(item),
        tone: 'muted',
      };
  }
}
