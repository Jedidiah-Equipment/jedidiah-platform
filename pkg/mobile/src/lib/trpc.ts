// `AppRouter` is a type-only import, so the server package is erased at build
// time and never bundled by Metro — only its end-to-end types reach the client.
import type { AppRouter } from '@pkg/api';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';

import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type TrpcClient = ReturnType<typeof createTrpcClient>;

export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiBaseUrl}/trpc`,
        fetch(url, options) {
          // Native has no cookie jar, so forward the better-auth session cookie
          // (stored in SecureStore) on every request. `credentials: 'include'`
          // covers react-native-web, where the browser owns the cookie instead.
          const cookie = sessionCookieHeader();
          const headers = new Headers(options?.headers);
          if (cookie) {
            headers.set('Cookie', cookie);
          }

          return fetch(url, { ...options, credentials: 'include', headers });
        },
      }),
    ],
  });
}
