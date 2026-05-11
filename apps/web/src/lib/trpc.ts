import type { AppRouter } from "@app/api/router-type";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";

import { getPublicAppConfig } from "./app-config.js";

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  const config = getPublicAppConfig();

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
