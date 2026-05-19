import { redirect } from '@tanstack/react-router';

import type { RouterContext } from '@/app/router-context.js';

export const ROUTE_AUTH_STALE_TIME_MS = 60 * 60 * 1000; // 1 hour

export function routeSessionQueryOptions(trpc: RouterContext['trpc']) {
  return trpc.auth.session.queryOptions(undefined, {
    staleTime: ROUTE_AUTH_STALE_TIME_MS,
  });
}

export async function getRouteSession({ queryClient, trpc }: RouterContext) {
  return queryClient.ensureQueryData(routeSessionQueryOptions(trpc));
}

export async function requireRouteSession(context: RouterContext) {
  const session = await getRouteSession(context);

  if (!session) {
    throw redirect({
      to: '/login',
    });
  }

  return session;
}
