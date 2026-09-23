import type { AppPermission, AuthId, UserAccessSummary } from '@pkg/schema';
import {
  closedJobStatuses,
  hasJobStatus,
  type JobActionBlockedReason,
  type JobActionName,
  type JobActions,
  type JobActionVerdict,
  type JobStatus,
  jobActionNames,
} from '@pkg/schema/contracting';
import { hasPermission } from '../auth/authorization.js';
import { isContractingManagement, jobStatusLabels } from './jobs.js';

/**
 * Who is asking: the session's access summary, which already names the person, built once at the API
 * edge and passed to every Job read and write.
 */
export type JobActor = UserAccessSummary;

/** The least of a Job the verdict needs, so a core row, a JobDetail and the phone's FieldJob all satisfy it. */
export type JobActionSubject = { status: JobStatus; foremanUserId: AuthId | null };

type Rule = {
  /** The statuses the action is open in. */
  statuses: readonly JobStatus[];
  /** Holding any of these lets a person ask for the action at all. */
  permissions: readonly AppPermission[];
  /** Who reaches every Job; anyone else who may ask reaches only the Jobs they are Foreman on. Absent, everyone does. */
  anyJob?: (actor: JobActor) => boolean;
  /** The narrower statuses someone reaching only their own Jobs may act in. */
  ownStatuses?: readonly JobStatus[];
  /** What the refusal copy calls the action: "You can only <verb> while …". */
  verb: string;
};

const open = ['upcoming', 'active'] as const satisfies readonly JobStatus[];
const worked = ['active', 'completed'] as const satisfies readonly JobStatus[];
/** Whoever may assign works every Job; a Foreman works only their own. */
const assigns = (actor: JobActor) => hasPermission(actor, 'contracting_job:assign');

const rules: Record<JobActionName, Rule> = {
  editSetup: { statuses: open, permissions: ['contracting_job:update'], verb: 'change Job setup' },
  assign: {
    statuses: open,
    permissions: ['contracting_job:assign', 'contracting_assignment:update-own'],
    anyJob: assigns,
    verb: 'change Machine Assignments',
  },
  patchTravel: {
    statuses: ['upcoming', 'active', 'completed'],
    permissions: ['contracting_job:assign', 'contracting_assignment:update-own'],
    anyJob: assigns,
    ownStatuses: open,
    verb: 'change travel',
  },
  editMeasures: { statuses: worked, permissions: ['contracting_job:update'], verb: 'change Measures' },
  editChargeLines: {
    statuses: worked,
    permissions: ['contracting_job:update'],
    verb: 'change Charge Lines',
  },
  resolveGaps: { statuses: worked, permissions: ['contracting_gap:resolve'], verb: 'resolve Hour Gaps' },
  editSignOffDetails: {
    statuses: ['completed', 'priced'],
    permissions: ['contracting_job:update'],
    verb: 'change sign-off details',
  },
  editDieselLitres: {
    statuses: ['completed'],
    permissions: ['contracting_job:update'],
    verb: 'change diesel litres',
  },
  complete: { statuses: ['active'], permissions: ['contracting_job:complete'], verb: 'complete the Job' },
  cancel: {
    statuses: ['upcoming', 'active', 'completed'],
    permissions: ['contracting_job:cancel'],
    verb: 'cancel the Job',
  },
  price: { statuses: ['completed'], permissions: ['contracting_job:price'], verb: 'price the Job' },
  stampInvoice: {
    statuses: ['priced'],
    permissions: ['contracting_invoice:update'],
    verb: 'stamp an Invoice Number',
  },
  amendReadings: {
    statuses: ['upcoming', 'active', 'completed', 'priced'],
    permissions: ['contracting_reading:update'],
    verb: 'amend readings',
  },
  capture: {
    statuses: open,
    permissions: ['contracting_reading:capture'],
    anyJob: isContractingManagement,
    verb: 'capture readings',
  },
};

const blocked = (reason: JobActionBlockedReason): JobActionVerdict => ({ allowed: false, reason });
const holdsAny = (actor: JobActor, permissions: readonly AppPermission[]) =>
  permissions.some((permission) => hasPermission(actor, permission));

const reachesEveryJob = (rule: Rule, actor: JobActor) => rule.anyJob?.(actor) ?? true;
const openStatuses = (rule: Rule, everyJob: boolean) =>
  everyJob ? rule.statuses : (rule.ownStatuses ?? rule.statuses);

/** Whether this actor may take this action on this Job now, and if not, the first reason why not. */
export function judgeJobAction(action: JobActionName, job: JobActionSubject, actor: JobActor): JobActionVerdict {
  const rule = rules[action];
  if (!holdsAny(actor, rule.permissions)) return blocked('no-permission');
  const everyJob = reachesEveryJob(rule, actor);
  if (!everyJob && job.foremanUserId !== actor.userId) return blocked('not-your-job');
  if (hasJobStatus(closedJobStatuses, job.status)) return blocked('closed');
  const statuses = openStatuses(rule, everyJob);
  if (hasJobStatus(statuses, job.status)) return { allowed: true };
  if (job.status === 'priced' && statuses.includes('completed')) return blocked('priced');
  return blocked('wrong-status');
}

/** Every Job Action's verdict for this actor, as the Job read serves them. */
export function deriveJobActions(job: JobActionSubject, actor: JobActor): JobActions {
  return Object.fromEntries(jobActionNames.map((action) => [action, judgeJobAction(action, job, actor)])) as JobActions;
}

const joinOr = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

/** The one sentence a refused Job Action shows, on the Job sheet and in the server's refusal alike. */
export function jobActionRefusal(
  action: JobActionName,
  reason: JobActionBlockedReason,
  job: JobActionSubject,
  actor: JobActor,
): string {
  const rule = rules[action];
  switch (reason) {
    case 'no-permission':
      return `You do not have permission to ${rule.verb}.`;
    case 'not-your-job':
      return 'This Job is assigned to another Foreman.';
    case 'closed':
      return `This Job is ${jobStatusLabels[job.status]}, so nothing on it can change.`;
    case 'priced':
      return `This Job is Priced, so you can no longer ${rule.verb}.`;
    case 'wrong-status': {
      const allowed = openStatuses(rule, reachesEveryJob(rule, actor)).map((status) => jobStatusLabels[status]);
      return `You can only ${rule.verb} while the Job is ${joinOr(allowed)}.`;
    }
  }
}
