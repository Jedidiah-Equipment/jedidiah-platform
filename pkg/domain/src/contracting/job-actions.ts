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
  jobStatuses,
  openJobStatuses,
  signedOffJobStatuses,
  unclosedJobStatuses,
  unpricedJobStatuses,
  workedJobStatuses,
} from '@pkg/schema/contracting';
import { hasPermission } from '../auth/authorization.js';
import { jobStatusLabels } from './jobs.js';

/**
 * Who is asking: the session's access summary, which already names the person, built once at the API
 * edge and passed to every Job read and write.
 */
export type JobActor = UserAccessSummary;

/** The least of a Job the verdict needs, so a core row and a JobDetail both satisfy it. */
export type JobActionSubject = { status: JobStatus; foremanUserId: AuthId | null };

type Rule = {
  /** The statuses the action is open in. */
  statuses: readonly JobStatus[];
  /** Holding any of these lets a person ask for the action at all. */
  permissions: readonly AppPermission[];
  /** Holding this reaches every Job; anyone else who may ask reaches only the Jobs they are Foreman on. Absent, everyone does. */
  anyJob?: AppPermission;
  /** The narrower statuses someone reaching only their own Jobs may act in. */
  ownStatuses?: readonly JobStatus[];
  /** Open on a closed Job too: saying something about a Job never changes it. */
  evenWhenClosed?: boolean;
  /** What the refusal copy calls the action: "You can only <verb> while …". */
  verb: string;
};

const rules: Record<JobActionName, Rule> = {
  editSetup: { statuses: openJobStatuses, permissions: ['contracting_job:update'], verb: 'change Job setup' },
  assignForeman: { statuses: openJobStatuses, permissions: ['contracting_job:assign'], verb: 'assign the Foreman' },
  assign: {
    statuses: openJobStatuses,
    permissions: ['contracting_job:assign', 'contracting_assignment:update-own'],
    anyJob: 'contracting_job:work-any',
    verb: 'change Machine Assignments',
  },
  // The Foreman records the production figures on site, so only while his own Job is Active; management amends after.
  editMeasures: {
    statuses: workedJobStatuses,
    permissions: ['contracting_job:update', 'contracting_assignment:update-own'],
    anyJob: 'contracting_job:update',
    ownStatuses: ['active'],
    verb: 'change Measures',
  },
  editChargeLines: {
    statuses: workedJobStatuses,
    permissions: ['contracting_job:update'],
    verb: 'change Charge Lines',
  },
  priceChargeLines: {
    statuses: workedJobStatuses,
    permissions: ['contracting_job:price'],
    verb: 'price Charge Lines',
  },
  editSignOffDetails: {
    statuses: signedOffJobStatuses,
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
    statuses: unpricedJobStatuses,
    permissions: ['contracting_job:cancel'],
    verb: 'cancel the Job',
  },
  price: { statuses: ['completed'], permissions: ['contracting_job:price'], verb: 'price the Job' },
  stampInvoice: {
    statuses: ['priced'],
    permissions: ['contracting_invoice:update'],
    verb: 'stamp an Invoice Number',
  },
  capture: {
    statuses: openJobStatuses,
    permissions: ['contracting_reading:capture'],
    anyJob: 'contracting_job:work-any',
    verb: 'capture Job hours',
  },
  // The Foreman edits his own Job's hours while it is open; management until Invoiced, with a reason once signed off.
  editHours: {
    statuses: unclosedJobStatuses,
    permissions: ['contracting_reading:capture', 'contracting_reading:update'],
    anyJob: 'contracting_job:work-any',
    ownStatuses: openJobStatuses,
    verb: 'change hours',
  },
  setTravel: { statuses: unclosedJobStatuses, permissions: ['contracting_travel:set'], verb: 'set Travel Hours' },
  // The core report judges a report that names a Job by this same rule, so the Job sheet and the server agree.
  reportBreakdown: {
    statuses: openJobStatuses,
    permissions: ['contracting_breakdown:report'],
    anyJob: 'contracting_breakdown:read',
    verb: 'report a Breakdown',
  },
  // Whoever reads a Job may say something on it; a Foreman reads his Jobs only until they are Priced.
  addNote: {
    statuses: jobStatuses,
    permissions: ['contracting_job:read', 'contracting_job:read-own'],
    anyJob: 'contracting_job:read',
    ownStatuses: unpricedJobStatuses,
    evenWhenClosed: true,
    verb: 'add a note',
  },
};

const joinOr = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

const holdsAny = (actor: JobActor, permissions: readonly AppPermission[]) =>
  permissions.some((permission) => hasPermission(actor, permission));

const reachesEveryJob = (rule: Rule, actor: JobActor) => rule.anyJob === undefined || hasPermission(actor, rule.anyJob);
const openStatuses = (rule: Rule, everyJob: boolean) =>
  everyJob ? rule.statuses : (rule.ownStatuses ?? rule.statuses);

/** The one sentence a refused Job Action shows, on the Job sheet and in the server's refusal alike. */
function refusalMessage(
  rule: Rule,
  reason: JobActionBlockedReason,
  job: JobActionSubject,
  statuses: readonly JobStatus[],
): string {
  switch (reason) {
    case 'no-permission':
      return `You do not have permission to ${rule.verb}.`;
    case 'not-your-job':
      return 'This Job is assigned to another Foreman.';
    case 'closed':
      return `This Job is ${jobStatusLabels[job.status]}, so nothing on it can change.`;
    case 'priced':
      return `This Job is Priced, so you can no longer ${rule.verb}.`;
    case 'wrong-status':
      return `You can only ${rule.verb} while the Job is ${joinOr(statuses.map((status) => jobStatusLabels[status]))}.`;
  }
}

/** Whether this actor may take this action on this Job now, and if not, the first reason why not. */
export function judgeJobAction(action: JobActionName, job: JobActionSubject, actor: JobActor): JobActionVerdict {
  const rule = rules[action];
  const everyJob = reachesEveryJob(rule, actor);
  const statuses = openStatuses(rule, everyJob);
  const blocked = (reason: JobActionBlockedReason): JobActionVerdict => ({
    allowed: false,
    reason,
    message: refusalMessage(rule, reason, job, statuses),
  });
  if (!holdsAny(actor, rule.permissions)) return blocked('no-permission');
  if (!everyJob && job.foremanUserId !== actor.userId) return blocked('not-your-job');
  if (!rule.evenWhenClosed && hasJobStatus(closedJobStatuses, job.status)) return blocked('closed');
  if (hasJobStatus(statuses, job.status)) return { allowed: true };
  if (job.status === 'priced' && statuses.includes('completed')) return blocked('priced');
  return blocked('wrong-status');
}

/** Every Job Action's verdict for this actor, as the Job read serves them. */
export function deriveJobActions(job: JobActionSubject, actor: JobActor): JobActions {
  return Object.fromEntries(jobActionNames.map((action) => [action, judgeJobAction(action, job, actor)])) as JobActions;
}
