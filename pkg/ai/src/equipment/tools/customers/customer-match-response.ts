import { CustomerPossibleMatch } from '@pkg/schema/equipment';
import { z } from 'zod';

/** A creation refusal gives the Assistant identities it can use without another directory search. */
export const CustomerMatchResponse = z.object({
  status: z.literal('possible_match'),
  possibleMatches: z.array(CustomerPossibleMatch),
  instruction: z.string(),
});
export type CustomerMatchResponse = z.infer<typeof CustomerMatchResponse>;

export function toCustomerMatchResponse(matches: CustomerPossibleMatch[]): CustomerMatchResponse {
  return {
    status: 'possible_match',
    possibleMatches: matches,
    instruction:
      'No Customer or Quote was created. Tell the user about the possible match. Use the existing Customer unless the user says this is a different company. If several Customers match, ask which one to use. Set allowPossibleMatch only after the user explicitly says it is a different company.',
  };
}
