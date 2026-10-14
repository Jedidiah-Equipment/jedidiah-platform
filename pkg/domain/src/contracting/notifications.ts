import type { AppRole, AuthId, PushKind, UserAccessSummary } from '@pkg/schema';
import type { BreakdownUrgency, JobStatus } from '@pkg/schema/contracting';
import { getBusinessRole } from '../auth/authorization.js';
import { formatHours } from '../formatting/number.js';
import { PUSH_KINDS } from '../push/push-kinds.js';
import { breakdownFirstLine, breakdownUrgencyLabels, canReadBreakdown, isBreakdownMine } from './breakdowns.js';
import { canReadJob } from './jobs.js';
import { serviceDueStatusLabels } from './service-due.js';

/** The Push Kind a reported Breakdown is, decided from the record: its urgency picks the kind. */
export const breakdownPushKind = (urgency: BreakdownUrgency): PushKind => `contracting.breakdown.${urgency}`;

export const SERVICE_DUE_SOON_PUSH_KIND: PushKind = 'contracting.service-due-soon';

export type ContractingPushEvent =
  | { kind: 'breakdown.reported'; breakdownId: string }
  | { kind: 'machine.service-due-soon'; machineId: string }
  | { kind: 'breakdown-note.added'; noteId: string }
  | { kind: 'job-note.added'; noteId: string };

/** What a push says and where tapping it lands; data names the record, never money. */
export type ContractingPushContent = {
  title: string;
  body: string;
  data: { business: 'contracting'; kind: 'breakdown' | 'machine' | 'job'; id: string; path: string };
  channelId: string;
  priority: 'high';
  sound: 'default';
};

const alertFor = (kind: PushKind) =>
  ({ channelId: PUSH_KINDS[kind].channel.id, priority: 'high', sound: 'default' }) as const;

export function breakdownPushMessage(breakdown: {
  id: string;
  urgency: BreakdownUrgency;
  subjectCode: string;
  firstLine: string;
  farmName: string | null;
  jobNumber: string | null;
  reporterName: string;
}): ContractingPushContent {
  const where = [breakdown.farmName, breakdown.jobNumber].filter((part) => part !== null).join(', ');
  const what = breakdown.firstLine.replace(/[.!?…\s]+$/, '');
  return {
    title: `${breakdownUrgencyLabels[breakdown.urgency]} · ${breakdown.subjectCode}`,
    body: `${what}${where ? ` at ${where}` : ''}. Reported by ${breakdown.reporterName}.`,
    data: {
      business: 'contracting',
      kind: 'breakdown',
      id: breakdown.id,
      path: `/contracting/workshop/${breakdown.id}`,
    },
    ...alertFor(breakdownPushKind(breakdown.urgency)),
  };
}

export function serviceDueSoonPushMessage(machine: {
  id: string;
  code: string;
  hoursToService: number;
}): ContractingPushContent {
  // A capture that jumps the whole window lands overdue, and says so.
  const overdue = machine.hoursToService < 0;
  return {
    title: `${serviceDueStatusLabels[overdue ? 'overdue' : 'due-soon']} · ${machine.code}`,
    body: overdue
      ? `Overdue by ${formatHours(-machine.hoursToService)}.`
      : `${formatHours(machine.hoursToService)} to next service.`,
    data: { business: 'contracting', kind: 'machine', id: machine.id, path: `/contracting/machines/${machine.id}` },
    ...alertFor(SERVICE_DUE_SOON_PUSH_KIND),
  };
}

const holdsRole = (access: UserAccessSummary, roles: readonly AppRole[]) => {
  const role = getBusinessRole(access, 'contracting');
  return role !== null && roles.includes(role);
};

/**
 * Whether a Job Note reaches this person: management, or a participant (the Job's Foreman, anyone who has noted it),
 * and only while they can still read the Job.
 */
export const jobNoteReaches = (
  access: UserAccessSummary,
  job: { status: JobStatus; foremanUserId: AuthId | null },
  noteAuthorIds: readonly AuthId[],
): boolean =>
  canReadJob(access, job) &&
  (holdsRole(access, ['contracting-manager', 'contracting-admin', 'super-admin']) ||
    job.foremanUserId === access.userId ||
    noteAuthorIds.includes(access.userId));

/**
 * Whether a Breakdown Note reaches this person: the Workshop Manager, or a participant (its reporter, its Job's
 * Foreman, anyone who has noted it), and only while they can still read the Breakdown.
 */
export const breakdownNoteReaches = (
  access: UserAccessSummary,
  breakdown: { reportedByUserId: AuthId; jobForemanUserId: AuthId | null },
  noteAuthorIds: readonly AuthId[],
): boolean =>
  canReadBreakdown(access, breakdown) &&
  (holdsRole(access, ['workshop-manager']) ||
    isBreakdownMine(breakdown, access.userId) ||
    noteAuthorIds.includes(access.userId));

const noteThreads = {
  job: { pushKind: 'contracting.job-note', path: (id: string) => `/contracting/jobs/${id}?tab=activity` },
  breakdown: {
    pushKind: 'contracting.breakdown-note',
    path: (id: string) => `/contracting/workshop/${id}?tab=activity`,
  },
} as const satisfies Record<string, { pushKind: PushKind; path: (id: string) => string }>;

export function notePushMessage(note: {
  kind: keyof typeof noteThreads;
  id: string;
  code: string;
  authorName: string;
  text: string;
}): ContractingPushContent {
  const thread = noteThreads[note.kind];
  // Leave room for author, title and navigation in the provider's 4 KiB payload.
  const preview = breakdownFirstLine(note.text, 241);
  return {
    title: `Note · ${note.code}`,
    body: `${note.authorName}: ${preview}`,
    data: { business: 'contracting', kind: note.kind, id: note.id, path: thread.path(note.id) },
    ...alertFor(thread.pushKind),
  };
}
