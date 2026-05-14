import { getUserAccessSummary } from '@pkg/core';
import { db } from '@pkg/db';
import type { UserAccessSummary } from '@pkg/schema';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

import { getSessionFromHeaders } from '../auth/session.js';

export async function createContext({ req }: CreateFastifyContextOptions) {
  const session = await getSessionFromHeaders(req.headers);
  const access: UserAccessSummary | null = session
    ? // This currently loads department memberships from the database for every authenticated
      // tRPC request. See docs/code-improvements/lazy-department-access.md before widening
      // department-aware authorization further.
      await getUserAccessSummary({
        db,
        role: session.user.role,
        userId: session.user.id,
      })
    : null;

  return {
    access,
    db,
    log: req.log,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
