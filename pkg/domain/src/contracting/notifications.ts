import type { AppRole, PushKind } from '@pkg/schema';
import type { BreakdownUrgency } from '@pkg/schema/contracting';
import { formatHours } from '../formatting/number.js';
import { NOTES_PUSH_CHANNEL_ID, PUSH_KINDS } from '../push/push-kinds.js';
import { breakdownUrgencyLabels } from './breakdowns.js';
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

/** The roles a note always reaches on top of its thread's participants. */
export const breakdownNoteRolePushRecipients: readonly AppRole[] = ['workshop-manager'];
export const jobNoteRolePushRecipients: readonly AppRole[] = [
  'contracting-manager',
  'contracting-admin',
  'super-admin',
];

export function notePushMessage(note: {
  kind: 'job' | 'breakdown';
  id: string;
  code: string;
  authorName: string;
  text: string;
}): ContractingPushContent {
  const firstLine = note.text.split('\n')[0]?.trim() ?? '';
  // Leave room for author, title and navigation in the provider's 4 KiB payload; keep surrogate pairs intact.
  const characters = Array.from(firstLine);
  const preview = characters.length > 240 ? `${characters.slice(0, 240).join('')}…` : firstLine;
  const path =
    note.kind === 'job' ? `/contracting/jobs/${note.id}?tab=activity` : `/contracting/workshop/${note.id}?tab=activity`;
  return {
    title: `Note · ${note.code}`,
    body: `${note.authorName}: ${preview}`,
    data: { business: 'contracting', kind: note.kind, id: note.id, path },
    channelId: NOTES_PUSH_CHANNEL_ID,
    priority: 'high',
    sound: 'default',
  };
}
