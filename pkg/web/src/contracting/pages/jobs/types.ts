import { actionSheet, hasJobCard } from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import { type BreakdownUrgency, type JobCreateInput, JobDescription, type JobDetail } from '@pkg/schema/contracting';
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
  /** Money reaches only the readers the server sends it to, once there is a Job Card to price. */
  const seesMoney = hasJobCard(job.status) && job.seesMoney;
  /** Work has started and the Job was not cancelled. */
  const started = job.status === 'active' || hasJobCard(job.status);
  return {
    ...sheet,
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
