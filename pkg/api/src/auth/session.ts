import type { IncomingHttpHeaders } from 'node:http';

import { fromNodeHeaders } from 'better-auth/node';

import { type Auth, auth } from './auth.js';
import { isBetterAuthRoleSignInEligible } from './sign-in-eligibility.js';

export { parseBetterAuthRole } from './sign-in-eligibility.js';

type BetterAuthSession = Auth['$Infer']['Session'];
type AuthApi = Pick<Auth['api'], 'getSession'>;

export type AppSession = BetterAuthSession & {
  user: BetterAuthSession['user'] & {
    role?: string | string[] | null;
    assistantEnabled?: boolean | null;
  };
};

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

  return isBetterAuthRoleSignInEligible(session.user.role) ? session : null;
}
