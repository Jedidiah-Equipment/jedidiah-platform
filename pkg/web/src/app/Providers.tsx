import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { Toaster } from '@/components/ui/sonner.js';
import { TooltipProvider } from '@/components/ui/tooltip.js';
import { createQueryClient } from '@/lib/query-client.js';
import { createTrpcClient, createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { ThemeProvider } from '@/providers/ThemeProvider.js';
import { router } from './router.js';

type ProvidersProps = Record<string, never>;

export const Providers: React.FC<ProvidersProps> = () => {
  const [queryClient] = useState(() => createQueryClient());
  const [trpcClient] = useState(() => createTrpcClient());
  const [trpc] = useState(() => createTrpcOptions(queryClient, trpcClient));

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <ThemeProvider defaultTheme="dark" storageKey="jedidiah-theme">
          <TooltipProvider>
            <RouterProvider context={{ queryClient, trpc }} router={router} />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </TRPCProvider>
    </QueryClientProvider>
  );
};
