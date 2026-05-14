import type { IncomingHttpHeaders } from 'node:http';

import { fromNodeHeaders } from 'better-auth/node';

import { auth } from './auth.js';

type BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type AppSession = BetterAuthSession & {
  user: BetterAuthSession['user'] & {
    role?: string | string[] | null;
  };
};

export async function getSessionFromHeaders(headers: IncomingHttpHeaders): Promise<AppSession | null> {
  return auth.api.getSession({
    headers: fromNodeHeaders(headers),
  }) as Promise<AppSession | null>;
}
