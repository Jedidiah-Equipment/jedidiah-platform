import { z } from 'zod';

/**
 * What an action policy answers: allowed, or refused with the first reason and `message`, the one sentence that says
 * why, as the server's refusal and every screen show it.
 */
export const actionVerdict = <Reason extends z.ZodType<string>>(reason: Reason) =>
  z.discriminatedUnion('allowed', [
    z.object({ allowed: z.literal(true) }),
    z.object({ allowed: z.literal(false), reason, message: z.string() }),
  ]);

/** One verdict per action name, as an entity read serves them for the person asking; permission sits inside each. */
export const actionVerdicts = <Name extends string, Verdict extends z.ZodType>(
  names: readonly Name[],
  verdict: Verdict,
) => z.object(Object.fromEntries(names.map((name) => [name, verdict])) as Record<Name, Verdict>);
