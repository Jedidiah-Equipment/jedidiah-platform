import { type Business, defaultBusiness, getPermissionBusiness, hasBusinessAccess, hasPermission } from '@pkg/domain';
import type { AppPermission, UserAccessSummary } from '@pkg/schema';
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

export async function getRouteAccess(context: RouterContext) {
  await requireRouteSession(context);
  return context.queryClient.ensureQueryData(context.trpc.auth.access.queryOptions(undefined));
}

export const BUSINESS_HOME = {
  contracting: '/contracting',
  equipment: '/equipment/dashboard',
} as const satisfies Record<Business, string>;

type BusinessAccess = Pick<UserAccessSummary, 'contractingRole' | 'equipmentRole'> | null | undefined;

// Sign-in eligibility keeps a session with no business out; `/login` is where such a session belongs anyway.
export function businessHomeFor(access: BusinessAccess) {
  const business = defaultBusiness(access);

  return business ? BUSINESS_HOME[business] : '/login';
}

export async function requireRouteBusinessAccess(context: RouterContext, business: Business) {
  const access = await getRouteAccess(context);

  if (!hasBusinessAccess(access, business)) {
    throw redirect({ to: businessHomeFor(access) });
  }

  return access;
}

export async function requireRoutePermission(context: RouterContext, permission: AppPermission) {
  const access = await getRouteAccess(context);

  if (!hasPermission(access, permission)) {
    const business = getPermissionBusiness(permission);

    throw redirect({ to: hasBusinessAccess(access, business) ? BUSINESS_HOME[business] : businessHomeFor(access) });
  }

  return access;
}
