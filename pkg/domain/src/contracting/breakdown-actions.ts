import type { AppPermission, AuthId, UserAccessSummary } from '@pkg/schema';
import {
  type BreakdownActionBlockedReason,
  type BreakdownActionName,
  type BreakdownActions,
  type BreakdownActionVerdict,
  type BreakdownStatus,
  breakdownActionNames,
} from '@pkg/schema/contracting';
import { hasPermission } from '../auth/authorization.js';
import { breakdownStatusLabels, isBreakdownMine } from './breakdowns.js';

/** Who is asking: the session's access summary, built once at the API edge. */
export type BreakdownActor = UserAccessSummary;

/** The least of a Breakdown the verdict needs, so a core row and a BreakdownDetail both satisfy it. */
export type BreakdownActionSubject = {
  status: BreakdownStatus;
  reportedByUserId: AuthId;
  jobForemanUserId: AuthId | null;
};

type Rule = {
  /** The statuses the action is open in. */
  statuses: readonly BreakdownStatus[];
  /** Holding any of these lets a person ask for the action at all. */
  permissions: readonly AppPermission[];
  /** Holding this reaches every Breakdown; anyone else who may ask reaches only their own. Absent, everyone does. */
  anyBreakdown?: AppPermission;
  /** What the refusal copy calls the action: "You can only <verb> while …". */
  verb: string;
};

const unsolved = ['open', 'in-progress'] as const;
const reporting: Pick<Rule, 'permissions' | 'anyBreakdown'> = {
  permissions: ['contracting_breakdown:update', 'contracting_breakdown:report'],
  anyBreakdown: 'contracting_breakdown:update',
};
const managing: Pick<Rule, 'permissions'> = { permissions: ['contracting_breakdown:update'] };

const rules: Record<BreakdownActionName, Rule> = {
  editReport: { statuses: unsolved, ...reporting, verb: 'change the report' },
  addPhotos: { statuses: unsolved, ...reporting, verb: 'add photos' },
  addNote: { statuses: ['open', 'in-progress', 'solved'], ...reporting, verb: 'add a note' },
  assignMechanic: { statuses: unsolved, ...managing, verb: 'assign the Mechanic' },
  start: { statuses: ['open'], ...managing, verb: 'start work' },
  solve: { statuses: unsolved, ...managing, verb: 'mark it Solved' },
};

const joinOr = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

function refusalMessage(rule: Rule, reason: BreakdownActionBlockedReason): string {
  switch (reason) {
    case 'no-permission':
      return `You do not have permission to ${rule.verb}.`;
    case 'not-yours':
      return 'This Breakdown was reported by someone else.';
    case 'solved':
      return 'This Breakdown is Solved, so nothing on it can change.';
    case 'wrong-status':
      return `You can only ${rule.verb} while the Breakdown is ${joinOr(rule.statuses.map((status) => breakdownStatusLabels[status]))}.`;
  }
}

/** Whether this actor may take this action on this Breakdown now, and if not, the first reason why not. */
export function judgeBreakdownAction(
  action: BreakdownActionName,
  breakdown: BreakdownActionSubject,
  actor: BreakdownActor,
): BreakdownActionVerdict {
  const rule = rules[action];
  const blocked = (reason: BreakdownActionBlockedReason): BreakdownActionVerdict => ({
    allowed: false,
    reason,
    message: refusalMessage(rule, reason),
  });
  if (!rule.permissions.some((permission) => hasPermission(actor, permission))) return blocked('no-permission');
  const everyBreakdown = rule.anyBreakdown === undefined || hasPermission(actor, rule.anyBreakdown);
  if (!everyBreakdown && !isBreakdownMine(breakdown, actor.userId)) return blocked('not-yours');
  if (breakdown.status === 'solved' && !rule.statuses.includes('solved')) return blocked('solved');
  if (rule.statuses.includes(breakdown.status)) return { allowed: true };
  return blocked('wrong-status');
}

/** Every Breakdown Action's verdict for this actor, as the Breakdown read serves them. */
export function deriveBreakdownActions(breakdown: BreakdownActionSubject, actor: BreakdownActor): BreakdownActions {
  return Object.fromEntries(
    breakdownActionNames.map((action) => [action, judgeBreakdownAction(action, breakdown, actor)]),
  ) as BreakdownActions;
}
