import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";

import { createQueryClient } from "@/lib/query-client.js";
import { createTrpcClient, trpc } from "@/lib/trpc.js";
import { router } from "./router.js";

type ProvidersProps = Record<string, never>;

export const Providers: React.FC<ProvidersProps> = () => {
  const [queryClient] = useState(() => createQueryClient());
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </trpc.Provider>
  );
};
