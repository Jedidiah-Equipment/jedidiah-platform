import {
  type AssignmentActionName,
  type AssignmentActionVerdict,
  hasJobCard,
  judgeAssignmentAction,
} from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import {
  type AssignmentState,
  type JobActionName,
  type JobCreateInput,
  JobDescription,
  type JobDetail,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { requiredSelection } from '@/components/form/utils/form-schema.js';

export const JobCreateValues = z.object({
  customerId: requiredSelection(UUID, 'Choose a Customer'),
  farmId: requiredSelection(UUID, 'Choose a Farm'),
  workTypeId: requiredSelection(UUID, 'Choose a Work Type'),
  description: z.string(),
  foremanUserId: z.string(),
});
export type JobCreateValues = z.infer<typeof JobCreateValues>;

export function toJobCreateInput(values: JobCreateValues): JobCreateInput {
  return {
    customerId: values.customerId,
    farmId: values.farmId,
    workTypeId: values.workTypeId,
    description: JobDescription.parse(values.description.trim() || null),
    foremanUserId: values.foremanUserId || null,
  };
}

/**
 * The Job sheet's reading of the Job Actions the server served for the signed-in person. Which cards appear at all
 * is presentation, not a Job Action. Two tiers of control:
 * - Card actions (a card's own button) take `action(name)`: nothing when the person lacks the permission, otherwise
 *   disabled with the server's own refusal while the Job refuses it.
 * - Row controls (icon buttons and inline cells inside a stint card or table row) render only while `can` is true,
 *   and a value that is on display renders read-only.
 */
export function jobSheet(job: JobDetail) {
  const verdict = (action: JobActionName) => job.actions[action];
  const can = (action: JobActionName) => verdict(action).allowed;
  const holds = (action: JobActionName) => {
    const judged = verdict(action);
    return judged.allowed || judged.reason !== 'no-permission';
  };
  const refusal = (action: JobActionName) => {
    const judged = verdict(action);
    return judged.allowed ? undefined : judged.message;
  };
  /** A Job Action on one Machine Assignment: the Job must allow it, then the Assignment's state. */
  const stintAction = (
    jobAction: JobActionName,
    assignmentAction: AssignmentActionName,
    stint: { state: AssignmentState },
  ): AssignmentActionVerdict => {
    const judged = verdict(jobAction);
    return judged.allowed
      ? judgeAssignmentAction(assignmentAction, stint)
      : { allowed: false, message: judged.message };
  };
  const seesMoney = hasJobCard(job.status) && job.pricing !== null;
  /** Work has started and the Job was not cancelled. */
  const started = job.status === 'active' || hasJobCard(job.status);
  return {
    can,
    /** The person holds the action's permission; only the Job's state or ownership can still refuse it. */
    holds,
    refusal,
    stintAction,
    /**
     * A card action's props: null when the person lacks the permission (render nothing), otherwise disabled with the
     * refusal while the Job refuses it. Row controls do not use this: they render only when `can` is true.
     */
    action: (name: JobActionName) => (holds(name) ? { disabled: !can(name), title: refusal(name) } : null),
    /** Money reaches only the readers the server sends it to, once there is a Job Card to price. */
    seesMoney,
    /** Which cards the sheet shows: presentation, not Job Actions. */
    showsSignOff: started && holds('editSignOffDetails'),
    showsChargeLines: job.status !== 'upcoming' && !seesMoney,
    showsInvoice: seesMoney && (job.status === 'priced' || job.status === 'invoiced'),
  };
}

/** What the signed-in person may do on the Job sheet, read from the served Job Actions. */
export type JobSheet = ReturnType<typeof jobSheet>;

/** The one dialog the Machines card has open, naming its Machine Assignment by id so it follows refetches. */
export type MachineDialog =
  | { kind: 'plan' }
  | { kind: 'arrival' | 'departure' | 'gap'; stintId: string }
  | { kind: 'reading'; stintId: string; role: 'arrival' | 'departure' };
