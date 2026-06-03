import { getUserAccessSummary, type StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import type { UserAccessSummary } from '@pkg/schema';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '../auth/session.js';

export type ContextDependencies = {
  storage: StorageAdapter;
};

export type Context = {
  access: UserAccessSummary | null;
  db: typeof db;
  log: CreateFastifyContextOptions['req']['log'];
  session: AppSession | null;
  storage: StorageAdapter;
};

export function createContextFactory(dependencies: ContextDependencies) {
  return async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
    const session = await getSessionFromHeaders(req.headers);
    const access: UserAccessSummary | null = session
      ? await getUserAccessSummary({
          db,
          role: parseBetterAuthRole(session.user.role),
          userId: session.user.id,
        })
      : null;

    return {
      access,
      db,
      log: req.log,
      session,
      storage: dependencies.storage,
    };
  };
}

export const createContext = createContextFactory({
  storage: {
    deleteObject: async () => undefined,
    get: async () => {
      throw new Error('Document storage is not configured.');
    },
    put: async () => undefined,
  },
});
