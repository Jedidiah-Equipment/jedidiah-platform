import type { AppRouter } from "@pkg/api/router-type";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";

import { getClientConfig } from "./app-config.js";

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  const config = getClientConfig();

  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${config.apiBaseUrl}/trpc`,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          } as RequestInit);
        },
      }),
    ],
  });
}
