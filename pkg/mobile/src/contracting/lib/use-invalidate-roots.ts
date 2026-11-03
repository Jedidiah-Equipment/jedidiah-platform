import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTRPC } from '@/lib/trpc';

type ContractingRoot = Extract<keyof ReturnType<typeof useTRPC>, `contracting${string}`>;

/** Refreshes every read under each named Contracting root after a write, settling once all have refetched. */
export function useInvalidateRoots() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    (...roots: ContractingRoot[]) =>
      Promise.all(roots.map((root) => queryClient.invalidateQueries({ queryKey: trpc[root].pathKey() }))),
    [trpc, queryClient],
  );
}
