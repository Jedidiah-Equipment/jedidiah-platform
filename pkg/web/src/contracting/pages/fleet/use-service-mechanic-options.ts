import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTRPC } from '@/lib/trpc.js';

/** The Mechanics a Service Record can name, as picker options; fetched only for someone who records services. */
export function useServiceMechanicOptions(enabled: boolean) {
  const trpc = useTRPC();
  const mechanics = useQuery(trpc.contractingServices.options.mechanics.queryOptions(undefined, { enabled }));
  const options = useMemo(
    () => (mechanics.data ?? []).map((person) => ({ value: person.id, label: person.name })),
    [mechanics.data],
  );
  return { options, error: mechanics.error };
}
