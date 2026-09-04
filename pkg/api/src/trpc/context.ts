import type { StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import { createUserAccessSummaryForUser } from '@pkg/domain';
import type { AppEnv, Changelog, UserAccessSummary } from '@pkg/schema';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

import type { Auth } from '../auth/auth.js';
import { type AppSession, getSessionFromHeaders } from '../auth/session.js';

/** Reads the bundled Changelog files. Injected so the changelog router can be tested without the filesystem. */
export type ChangelogLoader = () => Changelog[];

export type ContextDependencies = {
  appEnv: AppEnv;
  auth: Auth;
  changelogLoader: ChangelogLoader;
  storage: StorageAdapter;
};

export type Context = {
  access: UserAccessSummary | null;
  appEnv: AppEnv;
  auth: Auth;
  changelogLoader: ChangelogLoader;
  db: typeof db;
  log: CreateFastifyContextOptions['req']['log'];
  session: AppSession | null;
  storage: StorageAdapter;
};

export function createContextFactory(dependencies: ContextDependencies) {
  return async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
    const session = await getSessionFromHeaders(req.headers, dependencies.auth.api);
    const access = session ? createUserAccessSummaryForUser(session.user) : null;

    return {
      access,
      appEnv: dependencies.appEnv,
      auth: dependencies.auth,
      changelogLoader: dependencies.changelogLoader,
      db,
      log: req.log,
      session,
      storage: dependencies.storage,
    };
  };
}
