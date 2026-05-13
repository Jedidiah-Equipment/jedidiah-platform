import type { AppRouter } from "@pkg/api/router-type";
import type { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, loggerLink, type TRPCLink } from "@trpc/client";
import { createTRPCContext, createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import { getClientConfig } from "./app-config.js";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type TrpcClient = ReturnType<typeof createTrpcClient>;
export type TrpcOptions = ReturnType<typeof createTrpcOptions>;

export function createTrpcClient() {
  const config = getClientConfig();

  const enableLogger = localStorage.getItem("debug-trpc") === "true";

  const links: TRPCLink<AppRouter>[] = [];

  if (enableLogger) {
    links.push(loggerLink());
  }

  links.push(
    httpBatchLink({
      transformer: superjson,
      url: `${config.apiBaseUrl}/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        } as RequestInit);
      },
    }),
  );

  return createTRPCClient<AppRouter>({
    links,
  });
}

export function createTrpcOptions(queryClient: QueryClient, trpcClient: TrpcClient) {
  // Non-hook tRPC query helpers for router loaders/guards, where useTRPC() cannot run.
  return createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
  });
}
