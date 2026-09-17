// `AppRouter` is a type-only import, so the server package is erased at build
// time and never bundled by Metro — only its end-to-end types reach the client.
import type { AppRouter } from '@pkg/api';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';

import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';
import { withSessionCookie } from './authed-fetch';
import { addBreadcrumb } from './observability';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type TrpcClient = ReturnType<typeof createTrpcClient>;

export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiBaseUrl}/trpc`,
        async fetch(url, options) {
          const startedAt = Date.now();
          try {
            const response = await fetch(url, withSessionCookie(options, await sessionCookieHeader()));
            addBreadcrumb('network', 'tRPC batch', {
              durationMs: Date.now() - startedAt,
              method: options?.method ?? 'GET',
              procedurePath: trpcProcedurePath(url),
              status: response.status,
            });
            return response;
          } catch (error) {
            addBreadcrumb('network', 'tRPC batch failed', {
              durationMs: Date.now() - startedAt,
              method: options?.method ?? 'GET',
              procedurePath: trpcProcedurePath(url),
              status: 0,
            });
            throw error;
          }
        },
      }),
    ],
  });
}

export function trpcProcedurePath(url: RequestInfo | URL): string {
  const pathname = new URL(String(url), apiBaseUrl).pathname;
  const batchPath = pathname.split('/trpc/')[1] ?? '';
  return batchPath
    .split(',')
    .map((part) => decodeURIComponent(part))
    .filter(Boolean)
    .join(',');
}
