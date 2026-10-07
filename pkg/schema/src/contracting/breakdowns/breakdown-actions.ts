import { z } from 'zod';

/** Every write a person can ask of a Breakdown; reads stay with the Breakdown read scope. */
export const breakdownActionNames = ['editReport', 'addPhotos', 'addNote', 'assignMechanic', 'start', 'solve'] as const;
export type BreakdownActionName = (typeof breakdownActionNames)[number];

export const BreakdownActionBlockedReason = z.enum(['no-permission', 'not-yours', 'solved', 'wrong-status']);
export type BreakdownActionBlockedReason = z.infer<typeof BreakdownActionBlockedReason>;

export const BreakdownActionVerdict = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }),
  /** `message` is the one sentence that says why, as the server's refusal and every Breakdown screen show it. */
  z.object({ allowed: z.literal(false), reason: BreakdownActionBlockedReason, message: z.string() }),
]);
export type BreakdownActionVerdict = z.infer<typeof BreakdownActionVerdict>;

/** The Breakdown Actions verdicts for the person asking; permission sits inside them. */
export const BreakdownActions = z.object(
  Object.fromEntries(breakdownActionNames.map((name) => [name, BreakdownActionVerdict])) as Record<
    BreakdownActionName,
    typeof BreakdownActionVerdict
  >,
);
export type BreakdownActions = z.infer<typeof BreakdownActions>;
