import {
  type AssignmentActionName,
  type AssignmentActionVerdict,
  actionSheet,
  hasJobCard,
  judgeAssignmentAction,
} from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import {
  type Assignment,
  type AssignmentState,
  type BreakdownSummary,
  type BreakdownUrgency,
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
  const sheet = actionSheet(job.actions);
  /** A Job Action on one Machine Assignment: the Job must allow it, then the Assignment's state. */
  const stintAction = (
    jobAction: JobActionName,
    assignmentAction: AssignmentActionName,
    stint: { state: AssignmentState },
  ): AssignmentActionVerdict => {
    const judged = sheet.verdict(jobAction);
    return judged.allowed
      ? judgeAssignmentAction(assignmentAction, stint)
      : { allowed: false, message: judged.message };
  };
  const seesMoney = hasJobCard(job.status) && job.pricing !== null;
  /** Work has started and the Job was not cancelled. */
  const started = job.status === 'active' || hasJobCard(job.status);
  return {
    ...sheet,
    stintAction,
    /** Money reaches only the readers the server sends it to, once there is a Job Card to price. */
    seesMoney,
    /** Which cards the sheet shows: presentation, not Job Actions. */
    showsSignOff: started && sheet.holds('editSignOffDetails'),
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
  | { kind: 'reading'; stintId: string; role: 'arrival' | 'departure' }
  | { kind: 'breakdown'; stintId: string; urgency: BreakdownUrgency };

type StintOnJob = Pick<Assignment, 'id' | 'machineId' | 'implementId'> & {
  createdAt: string;
  arrival: { capturedAt: string } | null;
};

/**
 * Each stint's Breakdowns on this Job. A Breakdown names a Machine or Implement and the Job, not a stint, so it
 * lands on the latest stint of its subject that had started by the time it was reported, or the earliest one.
 */
export function breakdownsByStint<
  TBreakdown extends { subject: Pick<BreakdownSummary['subject'], 'kind' | 'id'>; reportedAt: string },
>(stints: readonly StintOnJob[], breakdowns: readonly TBreakdown[]): Map<string, TBreakdown[]> {
  const byStint = new Map<string, TBreakdown[]>();
  const startOf = (stint: StintOnJob) => stint.arrival?.capturedAt ?? stint.createdAt;
  for (const breakdown of breakdowns) {
    const { kind, id } = breakdown.subject;
    const candidates = stints
      .filter((stint) => (kind === 'machine' ? stint.machineId : stint.implementId) === id)
      .sort((left, right) => startOf(left).localeCompare(startOf(right)));
    const stint =
      candidates.findLast((candidate) => startOf(candidate) <= breakdown.reportedAt) ?? candidates[0] ?? null;
    if (!stint) continue;
    byStint.set(stint.id, [...(byStint.get(stint.id) ?? []), breakdown]);
  }
  return byStint;
}
