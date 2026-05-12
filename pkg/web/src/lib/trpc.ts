import type { AppRouter } from "@pkg/api/router-type";
import { createTRPCClient, httpBatchLink, loggerLink, type TRPCLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";

import { getClientConfig } from "./app-config.js";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function createTrpcClient() {
  const config = getClientConfig();

  const enableLogger = localStorage.getItem("debug-trpc") === "true";

  const links: TRPCLink<AppRouter>[] = [];

  if (enableLogger) {
    links.push(loggerLink());
  }

  links.push(
    httpBatchLink({
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
