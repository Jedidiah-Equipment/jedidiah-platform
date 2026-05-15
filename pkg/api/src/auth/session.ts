import type { IncomingHttpHeaders } from 'node:http';

import { AppRole, type AppRole as AppRoleType } from '@pkg/schema';
import { fromNodeHeaders } from 'better-auth/node';

import { auth } from './auth.js';

type BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type AppSession = BetterAuthSession & {
  user: BetterAuthSession['user'] & {
    role?: string | string[] | null;
  };
};

export function parseBetterAuthRole(role: unknown): AppRoleType {
  return AppRole.parse(Array.isArray(role) ? role[0] : role);
}

export async function getSessionFromHeaders(headers: IncomingHttpHeaders): Promise<AppSession | null> {
  return auth.api.getSession({
    headers: fromNodeHeaders(headers),
  }) as Promise<AppSession | null>;
}
