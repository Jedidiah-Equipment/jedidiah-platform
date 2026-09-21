import type { AuthId } from '@pkg/schema';

/**
 * Who a new Quote names as its Salesperson before anyone chooses: the acting User when the roster
 * holds them, otherwise nobody. Prefilling an id the picker never offers fails on submit.
 */
export function defaultQuoteSalespersonId({
  actingUserId,
  salespeople,
}: {
  actingUserId: AuthId | null | undefined;
  salespeople: readonly { id: AuthId }[];
}): AuthId | '' {
  return actingUserId && salespeople.some((person) => person.id === actingUserId) ? actingUserId : '';
}
