import type { AppRole, ContractingRole, UserAccessSummary } from '@pkg/schema';
import type { BreakdownUrgency } from '@pkg/schema/contracting';
import { getBusinessRole } from '../auth/authorization.js';
import { formatHours } from '../formatting/number.js';
import { breakdownUrgencyLabels } from './breakdowns.js';
import { serviceDueStatusLabels } from './service-due.js';

/** The one Android channel workshop pushes ring on; the native default channel carries the same id. */
export const WORKSHOP_PUSH_CHANNEL_ID = 'workshop';

/** A role a Contracting push can name: Contracting's own, or super-admin, which spans both businesses. */
export type ContractingPushRole = ContractingRole | 'super-admin';

export const breakdownPushRecipients: Record<BreakdownUrgency, readonly ContractingPushRole[]> = {
  'code-green': ['workshop-manager'],
  'code-red': ['workshop-manager', 'contracting-manager', 'contracting-admin', 'super-admin'],
};

export const serviceDueSoonPushRecipients: readonly ContractingPushRole[] = ['workshop-manager'];

const pushRecipientRoles = new Set<AppRole | null>([
  ...Object.values(breakdownPushRecipients).flat(),
  ...serviceDueSoonPushRecipients,
]);

/** Role membership is the opt-in: someone a workshop push can reach, and so the only one asked for notifications. */
export const isPushRecipient = (access: UserAccessSummary | null | undefined) =>
  pushRecipientRoles.has(getBusinessRole(access, 'contracting'));

export type ContractingPushEvent =
  | { kind: 'breakdown.reported'; breakdownId: string }
  | { kind: 'machine.service-due-soon'; machineId: string };

/** What a push says and where tapping it lands; data names the record, never money. */
export type ContractingPushContent = {
  title: string;
  body: string;
  data: { business: 'contracting'; kind: 'breakdown' | 'machine'; id: string; path: string };
  channelId: typeof WORKSHOP_PUSH_CHANNEL_ID;
  priority: 'high';
  sound: 'default';
};

const workshopAlert = { channelId: WORKSHOP_PUSH_CHANNEL_ID, priority: 'high', sound: 'default' } as const;

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
    ...workshopAlert,
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
    ...workshopAlert,
  };
}
