import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { createQueryClient } from './query-client';
import { createTrpcClient, TRPCProvider } from './trpc';

/** Wires React Query + the typed tRPC client for the whole app (mounted in app/_layout.tsx). */
export function ApiProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
