import type { InventoryRecipientOption } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';

import { ComboboxField } from '@/components/form/fields/ComboboxField.js';
import { authClient } from '@/lib/auth-client.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * The Operator a movement form opens with: a person session names itself, and a shared device names
 * nobody, so whoever is at it has to pick their own name before the post can go.
 */
export function useDefaultMovementOperator(): string {
  const { data: session } = authClient.useSession();

  return session?.user.isDevice === true ? '' : (session?.user.id ?? '');
}

/**
 * Who the movement is attributed to, rendered inside `<form.AppField name="actorUserId">`. Offers the
 * same people Received by does, so nothing picked here is refused on the post.
 */
export function MovementOperatorField({ enabled }: { enabled: boolean }) {
  const trpc = useTRPC();
  const people = useQuery(trpc.inventory.recipientOptions.queryOptions({ limit: 0, search: '' }, { enabled }));

  return (
    <ComboboxField
      emptyMessage="No active Equipment users found."
      label="Operator"
      options={personOptions(people.data?.items ?? [])}
      placeholder="Search people"
    />
  );
}

export function personOptions(people: readonly InventoryRecipientOption[]) {
  return people.map((person) => ({ label: person.name, value: person.id }));
}
