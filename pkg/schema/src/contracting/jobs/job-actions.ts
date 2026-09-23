import { z } from 'zod';

/** Every write a person can ask of a Job; reads stay with the Job read modes. */
export const jobActionNames = [
  'editSetup',
  'assign',
  'patchTravel',
  'editMeasures',
  'editChargeLines',
  'resolveGaps',
  'editSignOffDetails',
  'editDieselLitres',
  'complete',
  'cancel',
  'price',
  'stampInvoice',
  'amendReadings',
  'capture',
] as const;
export type JobActionName = (typeof jobActionNames)[number];

export const JobActionBlockedReason = z.enum(['no-permission', 'not-your-job', 'wrong-status', 'priced', 'closed']);
export type JobActionBlockedReason = z.infer<typeof JobActionBlockedReason>;

export const JobActionVerdict = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }),
  z.object({ allowed: z.literal(false), reason: JobActionBlockedReason }),
]);
export type JobActionVerdict = z.infer<typeof JobActionVerdict>;

/** The Job Actions verdicts for the person asking (see CONTEXT-CONTRACTING.md); permission sits inside them. */
export const JobActions = z.object(
  Object.fromEntries(jobActionNames.map((name) => [name, JobActionVerdict])) as Record<
    JobActionName,
    typeof JobActionVerdict
  >,
);
export type JobActions = z.infer<typeof JobActions>;
