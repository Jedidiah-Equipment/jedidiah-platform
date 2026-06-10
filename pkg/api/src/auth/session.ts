import type { IncomingHttpHeaders } from 'node:http';

import { AppRole, type AppRole as AppRoleType } from '@pkg/schema';
import { fromNodeHeaders } from 'better-auth/node';

import { auth } from './auth.js';
import { isSessionRoleSignInEligible } from './sign-in-eligibility.js';

type BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type AuthApi = Pick<typeof auth.api, 'getSession'>;

export type AppSession = BetterAuthSession & {
  user: BetterAuthSession['user'] & {
    role?: string | string[] | null;
  };
};

export function parseBetterAuthRole(role: unknown): AppRoleType {
  return AppRole.parse(Array.isArray(role) ? role[0] : role);
}

export async function getSessionFromHeaders(
  headers: IncomingHttpHeaders,
  authApi: AuthApi = auth.api,
): Promise<AppSession | null> {
  const session = (await authApi.getSession({
    headers: fromNodeHeaders(headers),
  })) as AppSession | null;

  return filterSignInEligibleSession(session);
}

export function filterSignInEligibleSession(session: AppSession | null): AppSession | null {
  if (!session) {
    return null;
  }

  return isSessionRoleSignInEligible(session.user.role) ? session : null;
}
