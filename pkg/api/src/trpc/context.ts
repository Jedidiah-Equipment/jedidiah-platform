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
  mobileObservability: MobileObservabilityCorrelation;
  session: AppSession | null;
  storage: StorageAdapter;
};

export type MobileObservabilityCorrelation = {
  mobileDistinctId?: string;
  mobileSessionId?: string;
};

export function createContextFactory(dependencies: ContextDependencies) {
  return async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
    const auth = req.server.auth;
    const session = await getSessionFromHeaders(req.headers, auth.api);
    const access = session ? createUserAccessSummaryForUser(session.user) : null;

    return {
      access,
      appEnv: dependencies.appEnv,
      auth,
      changelogLoader: dependencies.changelogLoader,
      db,
      log: req.log,
      mobileObservability: readMobileObservabilityCorrelation(req.headers),
      session,
      storage: dependencies.storage,
    };
  };
}

export function readMobileObservabilityCorrelation(
  headers: CreateFastifyContextOptions['req']['headers'],
): MobileObservabilityCorrelation {
  const mobileDistinctId = boundedHeader(headers['x-posthog-distinct-id']);
  const mobileSessionId = boundedHeader(headers['x-posthog-session-id']);

  return {
    ...(mobileDistinctId ? { mobileDistinctId } : {}),
    ...(mobileSessionId ? { mobileSessionId } : {}),
  };
}

function boundedHeader(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed && trimmed.length <= 240 ? trimmed : undefined;
}
