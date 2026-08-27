// `AppRouter` is a type-only import, so the server package is erased at build
// time and never bundled by Metro — only its end-to-end types reach the client.
import type { AppRouter } from '@pkg/api';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';

import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';
import { withSessionCookie } from './authed-fetch';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type TrpcClient = ReturnType<typeof createTrpcClient>;

export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiBaseUrl}/trpc`,
        async fetch(url, options) {
          return fetch(url, withSessionCookie(options, await sessionCookieHeader()));
        },
      }),
    ],
  });
}
