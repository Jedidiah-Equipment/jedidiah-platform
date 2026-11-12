import { z } from 'zod';
import { actionVerdict, actionVerdicts } from '../../common/action-verdicts.js';

/** Every write a person can ask of a Job; reads stay with the Job read modes. */
export const jobActionNames = [
  'editSetup',
  'assignForeman',
  'assign',
  'editMeasures',
  'editChargeLines',
  'priceChargeLines',
  'editSignOffDetails',
  'editDieselLitres',
  'complete',
  'cancel',
  'price',
  'stampInvoice',
  'capture',
  'editHours',
  'removeAssignment',
  'setTravel',
  'dismissAttention',
  'reportBreakdown',
  'addNote',
] as const;
export type JobActionName = (typeof jobActionNames)[number];

export const JobActionBlockedReason = z.enum(['no-permission', 'not-your-job', 'wrong-status', 'priced', 'closed']);
export type JobActionBlockedReason = z.infer<typeof JobActionBlockedReason>;

/** Which Job Action a refusal refused, and why: public context a surface can branch on. */
export const RefusedJobAction = z.object({ action: z.enum(jobActionNames), reason: JobActionBlockedReason });
export type RefusedJobAction = z.infer<typeof RefusedJobAction>;

export const JobActionVerdict = actionVerdict(JobActionBlockedReason);
export type JobActionVerdict = z.infer<typeof JobActionVerdict>;

/** The Job Actions verdicts for the person asking (see GLOSSARY-CONTRACTING.md); permission sits inside them. */
export const JobActions = actionVerdicts(jobActionNames, JobActionVerdict);
export type JobActions = z.infer<typeof JobActions>;

/** Every write a person can ask of one Machine Assignment, each judged under a Job Action first. */
export const assignmentActionNames = [
  'remove',
  'changeResources',
  'captureArrival',
  'captureDeparture',
  'editMeasures',
  'editHours',
  'setTravel',
  'dismissAttention',
  'price',
] as const;
export type AssignmentActionName = (typeof assignmentActionNames)[number];

/** A Job refusal passes through with its own reason; `wrong-state` is the Assignment's state refusing. */
export const AssignmentActionBlockedReason = z.enum([...JobActionBlockedReason.options, 'wrong-state']);
export type AssignmentActionBlockedReason = z.infer<typeof AssignmentActionBlockedReason>;

export const AssignmentActionVerdict = actionVerdict(AssignmentActionBlockedReason);
export type AssignmentActionVerdict = z.infer<typeof AssignmentActionVerdict>;

/** The Assignment Actions verdicts for the person asking: Job Action first, then the Assignment's state. */
export const AssignmentActions = actionVerdicts(assignmentActionNames, AssignmentActionVerdict);
export type AssignmentActions = z.infer<typeof AssignmentActions>;
