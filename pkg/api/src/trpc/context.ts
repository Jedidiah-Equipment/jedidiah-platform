import type { StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { AppEnv, Changelog, UserAccessSummary } from '@pkg/schema';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '../auth/session.js';
import type { TranslationMarker } from '../catalog-translations/translation-scheduler.js';

/** Reads the bundled Changelog files. Injected so the changelog router can be tested without the filesystem. */
export type ChangelogLoader = () => Changelog[];

export type ContextDependencies = {
  catalogTranslationScheduler?: TranslationMarker;
  appEnv: AppEnv;
  changelogLoader: ChangelogLoader;
  storage: StorageAdapter;
};

export type Context = {
  access: UserAccessSummary | null;
  appEnv: AppEnv;
  catalogTranslationScheduler: TranslationMarker;
  changelogLoader: ChangelogLoader;
  db: typeof db;
  log: CreateFastifyContextOptions['req']['log'];
  session: AppSession | null;
  storage: StorageAdapter;
};

export function createContextFactory(dependencies: ContextDependencies) {
  return async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
    const session = await getSessionFromHeaders(req.headers);
    const access: UserAccessSummary | null = session
      ? createUserAccessSummary({
          role: parseBetterAuthRole(session.user.role),
          userId: session.user.id,
        })
      : null;

    return {
      access,
      appEnv: dependencies.appEnv,
      catalogTranslationScheduler: dependencies.catalogTranslationScheduler ?? NOOP_TRANSLATION_MARKER,
      changelogLoader: dependencies.changelogLoader,
      db,
      log: req.log,
      session,
      storage: dependencies.storage,
    };
  };
}

const NOOP_TRANSLATION_MARKER: TranslationMarker = { mark: () => undefined };
