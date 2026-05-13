import { hasPermission } from "@pkg/domain";
import type { AppPermission } from "@pkg/schema";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/lib/trpc.js";

export function useAccess() {
  const trpc = useTRPC();

  return useQuery(
    trpc.auth.access.queryOptions(undefined, {
      staleTime: 30_000,
    }),
  );
}

export function useCan(permission: AppPermission) {
  const accessQuery = useAccess();

  return {
    ...accessQuery,
    can: hasPermission(accessQuery.data, permission),
  };
}
