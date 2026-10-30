import { useQuery } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

type Trpc = ReturnType<typeof useTRPC>;

/** The Mechanic set is one list on the server; each picker reads it behind the permission that unlocks that picker. */
const MECHANIC_PICKERS = {
  breakdown: {
    permission: 'contracting_breakdown:update',
    list: (trpc: Trpc) => trpc.contractingBreakdowns.options.mechanics,
  },
  service: {
    permission: 'contracting_service:update',
    list: (trpc: Trpc) => trpc.contractingServices.options.mechanics,
  },
} as const;

/** The people a Breakdown or a Service Record may name as its Mechanic, for whoever may name one. */
export function useMechanics(picker: keyof typeof MECHANIC_PICKERS) {
  const { permission, list } = MECHANIC_PICKERS[picker];
  const canPick = useSessionPermission(permission);
  const trpc = useTRPC();
  return fieldQuery(canPick, useQuery(list(trpc).queryOptions(undefined, { enabled: canPick })));
}
