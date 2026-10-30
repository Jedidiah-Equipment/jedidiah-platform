import type { PushKind } from '@pkg/schema';
import type { BreakdownUrgency, NoteThreadKind } from '@pkg/schema/contracting';
import { formatHours } from '../formatting/number.js';
import { type PushContent, pushAlert } from '../push/push-content.js';
import { breakdownUrgencyLabels } from './breakdowns.js';
import { serviceDueStatusLabels } from './service-due.js';

/** The Push Kind a reported Breakdown is, decided from the record: its urgency picks the kind. */
export const breakdownPushKind = (urgency: BreakdownUrgency): PushKind => `contracting.breakdown.${urgency}`;

export const SERVICE_DUE_SOON_PUSH_KIND: PushKind = 'contracting.service-due-soon';

export type ContractingPushEvent =
  | { kind: 'breakdown.reported'; breakdownId: string }
  | { kind: 'breakdown.escalated'; breakdownId: string; byUserId: string }
  | { kind: 'machine.service-due-soon'; machineId: string }
  | { kind: 'note.added'; thread: NoteThreadKind; noteId: string };

/** A push that names a Contracting record, so a Contracting builder cannot point the phone at the other business. */
export type ContractingPushContent = PushContent & { data: { business: 'contracting' } };

/** A reported Breakdown's alert; one changed to Code Red afterwards says so with "Now" and is otherwise the same. */
export function breakdownPushMessage(
  breakdown: {
    id: string;
    urgency: BreakdownUrgency;
    subjectCode: string;
    firstLine: string;
    farmName: string | null;
    jobNumber: string | null;
    reporterName: string;
  },
  { escalated = false }: { escalated?: boolean } = {},
): ContractingPushContent {
  const where = [breakdown.farmName, breakdown.jobNumber].filter((part) => part !== null).join(', ');
  const what = breakdown.firstLine.replace(/[.!?…\s]+$/, '');
  return {
    title: `${escalated ? 'Now ' : ''}${breakdownUrgencyLabels[breakdown.urgency]} · ${breakdown.subjectCode}`,
    body: `${what}${where ? ` at ${where}` : ''}. Reported by ${breakdown.reporterName}.`,
    data: {
      business: 'contracting',
      kind: 'breakdown',
      id: breakdown.id,
      path: `/contracting/workshop/${breakdown.id}`,
    },
    ...pushAlert(breakdownPushKind(breakdown.urgency)),
  };
}

export function serviceDueSoonPushMessage(machine: {
  id: string;
  code: string;
  knownHours: number;
  hoursToService: number;
}): ContractingPushContent {
  // A capture that jumps the whole window lands overdue, and says so.
  const overdue = machine.hoursToService < 0;
  return {
    title: `${serviceDueStatusLabels[overdue ? 'overdue' : 'due-soon']} · ${machine.code}`,
    body: `Known hours ${formatHours(machine.knownHours)} · ${
      overdue
        ? `overdue by ${formatHours(-machine.hoursToService)}.`
        : `${formatHours(machine.hoursToService)} to next service.`
    }`,
    data: { business: 'contracting', kind: 'machine', id: machine.id, path: `/contracting/machines/${machine.id}` },
    ...pushAlert(SERVICE_DUE_SOON_PUSH_KIND),
  };
}
