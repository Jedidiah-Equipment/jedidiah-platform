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
  /**
   * Holding any of these reaches every Job; anyone else who may ask reaches only the Jobs they are
   * Foreman on. Absent, the permission itself reaches every Job.
   */
  anyJob?: readonly AppPermission[];
  /** The narrower statuses someone reaching only their own Jobs may act in. */
  ownStatuses?: readonly JobStatus[];
  /** What the refusal copy calls the action: "You can only <verb> while …". */
  verb: string;
};

const open = ['upcoming', 'active'] as const satisfies readonly JobStatus[];
const worked = ['active', 'completed'] as const satisfies readonly JobStatus[];
/** Whoever may assign works every Job; a Foreman works only their own. */
const manages = ['contracting_job:assign'] as const satisfies readonly AppPermission[];

const rules: Record<JobActionName, Rule> = {
  editSetup: { statuses: open, permissions: ['contracting_job:update'], verb: 'change Job setup' },
  assign: {
    statuses: open,
    permissions: ['contracting_job:assign', 'contracting_assignment:update-own'],
    anyJob: manages,
    verb: 'change Machine Assignments',
  },
  patchTravel: {
    statuses: ['upcoming', 'active', 'completed'],
    permissions: ['contracting_job:assign', 'contracting_assignment:update-own'],
    anyJob: manages,
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
    anyJob: manages,
    verb: 'capture readings',
  },
};

const blocked = (reason: JobActionBlockedReason): JobActionVerdict => ({ allowed: false, reason });
const holdsAny = (actor: JobActor, permissions: readonly AppPermission[]) =>
  permissions.some((permission) => hasPermission(actor, permission));

const reachesEveryJob = (rule: Rule, actor: JobActor) => rule.anyJob === undefined || holdsAny(actor, rule.anyJob);
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

export const jobStatusLabels: Record<JobStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  priced: 'Priced',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
};

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
      const subject = rule.verb.endsWith('the Job') ? 'it' : 'the Job';
      const allowed = openStatuses(rule, reachesEveryJob(rule, actor)).map((status) => jobStatusLabels[status]);
      return `You can only ${rule.verb} while ${subject} is ${joinOr(allowed)}.`;
    }
  }
}

/** A move along the Job lifecycle, carrying what the stamps it writes need. */
export type JobTransition =
  | { type: 'activate' }
  | { type: 'complete'; at: Date; byUserId: AuthId; startDate: string; endDate: string }
  | { type: 'price'; at: Date; byUserId: AuthId; subtotal: number; total: number }
  | { type: 'reopen'; at: Date; note: string }
  | { type: 'invoice'; at: Date; byUserId: AuthId; invoiceNumber: string }
  | { type: 'cancel'; at: Date; byUserId: AuthId; reason: string };

const transitionsFrom: Record<JobTransition['type'], readonly JobStatus[]> = {
  activate: ['upcoming'],
  complete: ['active'],
  price: ['completed'],
  reopen: ['priced'],
  invoice: ['priced'],
  cancel: ['upcoming', 'active', 'completed'],
};

const article = (label: string) => (/^[AEIOU]/.test(label) ? 'An' : 'A');

/**
 * The status a lifecycle move lands on and the columns that travel with it, including the ones the
 * database requires cleared. It judges no one: the caller has already asserted the Job Action. A move
 * the lifecycle has no edge for is a programming error, not a refusal.
 */
export function transitionJob<T extends JobTransition>(job: { status: JobStatus }, event: T) {
  if (!transitionsFrom[event.type].includes(job.status)) {
    const label = jobStatusLabels[job.status];
    throw new Error(`${article(label)} ${label} Job cannot ${event.type}.`);
  }
  return columnsFor(event);
}

function columnsFor(event: JobTransition) {
  switch (event.type) {
    case 'activate':
      return { status: 'active' } as const;
    case 'complete':
      return {
        status: 'completed',
        completedAt: event.at,
        completedByUserId: event.byUserId,
        startDate: event.startDate,
        endDate: event.endDate,
      } as const;
    case 'price':
      return {
        status: 'priced',
        pricedAt: event.at,
        pricedByUserId: event.byUserId,
        pricedSubtotal: event.subtotal,
        pricedTotal: event.total,
        reopenedAt: null,
        repricingNote: null,
      } as const;
    case 'reopen':
      return {
        status: 'completed',
        pricedAt: null,
        pricedByUserId: null,
        pricedSubtotal: null,
        pricedTotal: null,
        reopenedAt: event.at,
        repricingNote: event.note,
      } as const;
    case 'invoice':
      return {
        status: 'invoiced',
        invoiceNumber: event.invoiceNumber,
        invoicedAt: event.at,
        invoicedByUserId: event.byUserId,
      } as const;
    case 'cancel':
      return {
        status: 'cancelled',
        cancelledAt: event.at,
        cancelledByUserId: event.byUserId,
        cancellationReason: event.reason,
        completedAt: null,
        completedByUserId: null,
        reopenedAt: null,
        repricingNote: null,
      } as const;
  }
}
