import { hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { useAuthSession } from './auth-session';
import { useTRPC } from './trpc';

/**
 * The signed-in user's permission summary from `auth.access` (a session-only
 * procedure, so it resolves even for users who lack feature permissions). Mirrors
 * web's `useAccess`/`useCan` (pkg/web/src/hooks/use-access.ts) so device and browser
 * gate features the same way — check `can` before firing a permission-gated query
 * instead of letting the request 403.
 */
export function useAccess() {
  const trpc = useTRPC();

  return useQuery(trpc.auth.access.queryOptions(undefined, { staleTime: 30_000 }));
}

export function useCan(permission: AppPermission) {
  const accessQuery = useAccess();

  return {
    ...accessQuery,
    can: hasPermission(accessQuery.data, permission),
  };
}

export function useAssistantEnabled(): boolean {
  return useAuthSession().user.assistantEnabled === true;
}
