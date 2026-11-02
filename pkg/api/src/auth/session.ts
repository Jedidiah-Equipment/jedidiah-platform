import type { IncomingHttpHeaders } from 'node:http';

import { isStoredUserSignInEligible } from '@pkg/domain';
import { fromNodeHeaders } from 'better-auth/node';

import type { Auth } from './auth.js';

type BetterAuthSession = Auth['$Infer']['Session'];
type AuthApi = Pick<Auth['api'], 'getSession'>;

export type AppSession = BetterAuthSession & {
  user: BetterAuthSession['user'] & {
    role?: string | string[] | null;
    contractingRole?: string | null;
    assistantEnabled?: boolean | null;
  };
};

export async function getSessionFromHeaders(
  headers: IncomingHttpHeaders,
  authApi: AuthApi,
): Promise<AppSession | null> {
  // Callers never forward Better Auth's Set-Cookie, so a refresh here would extend the session row while the
  // client's cookie kept its old expiry. The clients' own get-session calls do the refresh.
  const session = (await authApi.getSession({
    headers: fromNodeHeaders(headers),
    query: { disableRefresh: true },
  })) as AppSession | null;

  return filterSignInEligibleSession(session);
}

export function filterSignInEligibleSession(session: AppSession | null): AppSession | null {
  if (!session) {
    return null;
  }

  return isStoredUserSignInEligible(session.user) ? session : null;
}
