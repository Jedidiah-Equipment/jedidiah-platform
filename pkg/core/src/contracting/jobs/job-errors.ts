import {
  assignmentActionJobAction,
  assignmentState,
  type JobActionSubject,
  type JobActor,
  judgeAssignmentAction,
  judgeJobAction,
} from '@pkg/domain/contracting';
import type {
  AssignmentActionName,
  JobActionBlockedReason,
  JobActionName,
  RefusedJobAction,
} from '@pkg/schema/contracting';
import { translatingConstraintViolations } from '../../errors/constraint-violations.js';

export type JobErrorCode =
  | 'contracting_job.not_found'
  | 'contracting_job.duplicate'
  | 'contracting_job.invalid_reference'
  | 'contracting_job.invalid_foreman'
  | 'contracting_job.invalid_driver'
  | 'contracting_job.not_owner'
  | 'contracting_job.forbidden'
  | 'contracting_job.wrong_status'
  | 'contracting_job.stint_not_planned'
  | 'contracting_job.has_on_site_stints'
  | 'contracting_job.departure_before_arrival'
  | 'contracting_job.departure_not_editable'
  | 'contracting_job.reason_required'
  | 'contracting_job.pricing_incomplete'
  | 'contracting_job.total_changed'
  | 'contracting_job.rate_inactive'
  | 'contracting_job.attention_cleared';

export class JobError extends Error {
  constructor(
    readonly code: JobErrorCode,
    message: string,
    readonly refused?: RefusedJobAction,
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export const isJobError = (error: unknown): error is JobError => error instanceof JobError;
export const jobNotFound = (noun = 'Job') => new JobError('contracting_job.not_found', `${noun} not found.`);
export const wrongStatus = (message: string) => new JobError('contracting_job.wrong_status', message);
export const totalChanged = (message: string) => new JobError('contracting_job.total_changed', message);
export const attentionCleared = () =>
  new JobError('contracting_job.attention_cleared', 'This warning no longer applies.');

const foreignKeyErrors: Record<string, () => JobError> = {
  job_foreman_role: () =>
    new JobError('contracting_job.invalid_foreman', 'Select a person with the Contracting foreman role.'),
  machine_assignment_driver_role: () =>
    new JobError('contracting_job.invalid_driver', 'Select a person with the Contracting driver role.'),
  job_farm_customer_fk: () =>
    new JobError('contracting_job.invalid_reference', 'Pick a Farm that belongs to this Customer.'),
};

export const withJobConstraints = <T>(action: () => Promise<T>) =>
  translatingConstraintViolations(
    {
      unique: () => new JobError('contracting_job.duplicate', 'That record already exists.'),
      foreignKey: (constraint) =>
        foreignKeyErrors[constraint]?.() ??
        new JobError('contracting_job.invalid_reference', 'The selected record no longer exists.'),
    },
    action,
  );

const refusalCodes: Record<JobActionBlockedReason, JobErrorCode> = {
  'no-permission': 'contracting_job.forbidden',
  'not-your-job': 'contracting_job.not_owner',
  'wrong-status': 'contracting_job.wrong_status',
  priced: 'contracting_job.wrong_status',
  closed: 'contracting_job.wrong_status',
};

/** Refuses unless this actor may take this Job Action on this Job now: every status refusal is raised here. */
export function assertJobAction(action: JobActionName, job: JobActionSubject, actor: JobActor) {
  const verdict = judgeJobAction(action, job, actor);
  if (!verdict.allowed)
    throw new JobError(refusalCodes[verdict.reason], verdict.message, { action, reason: verdict.reason });
}

type StintStateRow = { arrivalHours: number | null; departureHours: number | null };

/** Whether this actor may take this Assignment Action on this stint now: its Job Action first, then its state. */
export const judgeStintAction = (
  action: AssignmentActionName,
  job: JobActionSubject,
  stint: StintStateRow,
  actor: JobActor,
) =>
  judgeAssignmentAction(action, judgeJobAction(assignmentActionJobAction[action], job, actor), {
    state: assignmentState(stint),
  });

/** Throws an Assignment Action's refusal as the error its reason maps to. */
export function assertStintVerdict(action: AssignmentActionName, verdict: ReturnType<typeof judgeStintAction>) {
  if (verdict.allowed) return;
  if (verdict.reason === 'wrong-state') throw wrongStatus(verdict.message);
  throw new JobError(refusalCodes[verdict.reason], verdict.message, {
    action: assignmentActionJobAction[action],
    reason: verdict.reason,
  });
}

/** Refuses unless this actor may take this Assignment Action on this stint now. */
export function assertStintAction(
  action: AssignmentActionName,
  job: JobActionSubject,
  stint: StintStateRow,
  actor: JobActor,
) {
  assertStintVerdict(action, judgeStintAction(action, job, stint, actor));
}

/** A read-side check: a Foreman reads only the Jobs they are Foreman on. */
export function assertOwner(job: { foremanUserId: string | null }, actorUserId: string) {
  if (job.foremanUserId !== actorUserId)
    throw new JobError('contracting_job.not_owner', 'This Job is assigned to another Foreman.');
}
