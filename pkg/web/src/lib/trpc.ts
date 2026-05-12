import type { AppRouter } from "@pkg/api/router-type";
import { createTRPCReact, httpBatchLink, loggerLink } from "@trpc/react-query";

import { getClientConfig } from "./app-config.js";

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  const config = getClientConfig();

  const enableLogger = localStorage.getItem("debug-trpc") === "true";

  const links = [];

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

  return trpc.createClient({
    links,
  });
}
