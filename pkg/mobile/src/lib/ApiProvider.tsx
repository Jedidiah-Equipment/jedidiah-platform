import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { useSession } from './auth';
import { addBreadcrumb, identifyObservabilityUser } from './observability';
import type { MutationEventCatalog } from './observability-contract';
import { createQueryClient } from './query-client';
import { sessionUserId } from './session-state';
import { createTrpcClient, TRPCProvider } from './trpc';

/** Wires React Query + the typed tRPC client for the whole app (mounted in app/_layout.tsx). */
export function ApiProvider({
  children,
  mutationEvents = {},
}: {
  children: ReactNode;
  mutationEvents?: MutationEventCatalog;
}) {
  const [queryClient] = useState(() => createQueryClient({ mutationEvents }));
  const [trpcClient] = useState(() => createTrpcClient());

  // The QueryClient outlives sign-out in this single long-lived process, so drop
  // all cached data whenever the signed-in user changes. Otherwise the next account
  // (e.g. a sales user without `equipment_job:read`) could briefly render the previous user's
  // cached query under the same key before its refetch 403s.
  const { data: session } = useSession();
  const userId = sessionUserId(session);
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (userId) identifyObservabilityUser(userId);
    if (previousUserId.current === userId) return;

    // Skip the initial null → user hydration: on web `useSession` resolves the session
    // asynchronously (a get-session request), so the first resolve would otherwise clear
    // the cache out from under in-flight queries and strand the board on its loading state.
    // Only a genuine account switch (a previously-known user changing) needs the cache dropped.
    const hadUser = previousUserId.current !== null;
    previousUserId.current = userId;
    if (hadUser) {
      queryClient.clear();
      addBreadcrumb('auth', 'query cache cleared');
    }
  }, [userId, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
