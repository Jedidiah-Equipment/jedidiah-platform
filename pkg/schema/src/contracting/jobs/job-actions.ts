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
