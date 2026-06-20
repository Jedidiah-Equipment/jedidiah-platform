import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { useSession } from './auth';
import { createQueryClient } from './query-client';
import { createTrpcClient, TRPCProvider } from './trpc';

/** Wires React Query + the typed tRPC client for the whole app (mounted in app/_layout.tsx). */
export function ApiProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());
  const [trpcClient] = useState(() => createTrpcClient());

  // The QueryClient outlives sign-out in this single long-lived process, so drop
  // all cached data whenever the signed-in user changes. Otherwise the next account
  // (e.g. a sales user without `job:read`) could briefly render the previous user's
  // cached query under the same key before its refetch 403s.
  const { data: session } = useSession();
  const userId = session?.user.id ?? null;
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (previousUserId.current !== userId) {
      previousUserId.current = userId;
      queryClient.clear();
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
