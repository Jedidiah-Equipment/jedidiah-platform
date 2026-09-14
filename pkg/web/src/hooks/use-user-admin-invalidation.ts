import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

/** User admin is shared by both businesses, so its invalidation lives beside the shared auth cache rather than in either business's hook. */
export function useUserAdminInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const invalidateAuth = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.auth.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateUsers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.users.pathKey() }),
    [queryClient, trpc],
  );

  return useMemo(() => ({ invalidateAuth, invalidateUsers }), [invalidateAuth, invalidateUsers]);
}
