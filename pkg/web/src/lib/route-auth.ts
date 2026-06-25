import { hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
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

export async function requireRoutePermission(context: RouterContext, permission: AppPermission) {
  await requireRouteSession(context);
  const access = await context.queryClient.ensureQueryData(context.trpc.auth.access.queryOptions(undefined));

  if (!hasPermission(access, permission)) {
    throw redirect({
      to: '/dashboard',
    });
  }

  return access;
}
