import { z } from 'zod';

/** Every write a person can ask of a Job; reads stay with the Job read modes. */
export const jobActionNames = [
  'editSetup',
  'assignForeman',
  'assign',
  'patchTravel',
  'editMeasures',
  'editChargeLines',
  'priceChargeLines',
  'resolveGaps',
  'editSignOffDetails',
  'editDieselLitres',
  'complete',
  'cancel',
  'price',
  'stampInvoice',
  'amendReadings',
  'capture',
  'reportBreakdown',
  'addNote',
] as const;
export type JobActionName = (typeof jobActionNames)[number];

export const JobActionBlockedReason = z.enum(['no-permission', 'not-your-job', 'wrong-status', 'priced', 'closed']);
export type JobActionBlockedReason = z.infer<typeof JobActionBlockedReason>;

export const JobActionVerdict = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }),
  /** `message` is the one sentence that says why, as the server's refusal and the Job sheet both show it. */
  z.object({ allowed: z.literal(false), reason: JobActionBlockedReason, message: z.string() }),
]);
export type JobActionVerdict = z.infer<typeof JobActionVerdict>;

/** The Job Actions verdicts for the person asking (see GLOSSARY-CONTRACTING.md); permission sits inside them. */
export const JobActions = z.object(
  Object.fromEntries(jobActionNames.map((name) => [name, JobActionVerdict])) as Record<
    JobActionName,
    typeof JobActionVerdict
  >,
);
export type JobActions = z.infer<typeof JobActions>;

/** Every write a person can ask of one Machine Assignment, each judged under a Job Action first. */
export const assignmentActionNames = [
  'remove',
  'changeResources',
  'captureArrival',
  'captureDeparture',
  'editMeasures',
  'resolveGap',
  'price',
] as const;
export type AssignmentActionName = (typeof assignmentActionNames)[number];

/** A Job refusal passes through with its own reason; `wrong-state` is the Assignment's state refusing. */
export const AssignmentActionBlockedReason = z.enum([...JobActionBlockedReason.options, 'wrong-state']);
export type AssignmentActionBlockedReason = z.infer<typeof AssignmentActionBlockedReason>;

export const AssignmentActionVerdict = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }),
  z.object({ allowed: z.literal(false), reason: AssignmentActionBlockedReason, message: z.string() }),
]);
export type AssignmentActionVerdict = z.infer<typeof AssignmentActionVerdict>;

/** The Assignment Actions verdicts for the person asking: Job Action first, then the Assignment's state. */
export const AssignmentActions = z.object(
  Object.fromEntries(assignmentActionNames.map((name) => [name, AssignmentActionVerdict])) as Record<
    AssignmentActionName,
    typeof AssignmentActionVerdict
  >,
);
export type AssignmentActions = z.infer<typeof AssignmentActions>;
