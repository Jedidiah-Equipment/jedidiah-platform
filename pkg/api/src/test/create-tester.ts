import type { StorageAdapter, StoragePutInput, StoredObject } from '@pkg/core';
import { createDatabaseClient, type Db, withTestDatabase } from '@pkg/db';
import { createUserAccessSummaryForUser } from '@pkg/domain';
import pino from 'pino';
import { type TestAPI, type TestContext, test as testBase } from 'vitest';

import { type Auth, createAuth } from '@/app-auth.js';
import type { ChangelogLoader, Context } from '@/trpc/context.js';
import { type AppRouter, type AppRouterDependencies, createAppRouterCaller } from '@/trpc/router.js';
import { mockSession } from './test-utils.js';
import { testProfiles } from './transcription-fixtures.js';

type Cleanup = () => Promise<void> | void;
export type AppRouterCaller = ReturnType<AppRouter['createCaller']>;

/** Per-caller overrides for the injectable context dependencies a test wants to vary. */
export type CallerOverrides = {
  access?: Context['access'];
  appEnv?: Context['appEnv'];
  changelogLoader?: ChangelogLoader;
  contracting?: Partial<AppRouterDependencies['contracting']>;
  equipment?: Partial<AppRouterDependencies['equipment']>;
  transcriptions?: Partial<AppRouterDependencies['transcriptions']>;
};

export const NOOP_ROUTER_DEPENDENCIES: AppRouterDependencies = {
  contracting: {
    johnDeere: null,
    push: { schedule: () => undefined },
  },
  equipment: { catalogTranslationScheduler: { mark: () => undefined, markNow: () => undefined } },
  transcriptions: {
    hintDerivations: { schedule: () => undefined },
    profiles: testProfiles(),
    models: { chat: 'test-chat-model', transcription: 'test-transcription-model' },
  },
};

export type TesterScope = {
  auth: Auth;
  cleanup: (cleanup: Cleanup) => void;
  databaseName: string;
  databaseUrl: string;
  db: Db;
};

export type TesterContext = {
  createAnonCaller: () => AppRouterCaller;
  createCaller: (session?: NonNullable<Context['session']>, overrides?: CallerOverrides) => AppRouterCaller;
};

type CreateTesterContext<T extends object> = (scope: TesterScope & TesterContext) => Promise<T> | T;

/**
 * `scope: 'file'` hands every test in the file one database built once, so each test must create the rows it
 * acts on rather than assume an empty database.
 */
export function createTester<T extends object = Record<string, never>>(
  createContext: CreateTesterContext<T> = () => ({}) as T,
  { max = 2, scope = 'test' }: { max?: number; scope?: 'test' | 'file' } = {},
): TestAPI<{ context: TesterContext & T }> {
  const provide = (use: (ctx: TesterContext & T) => Promise<void>) =>
    withTestDatabase(async ({ databaseName, databaseUrl }) => {
      const databaseClient = createDatabaseClient(databaseUrl, { max });
      const auth = createAuth(databaseClient.db);
      const cleanups: Cleanup[] = [];

      try {
        const testLog = pino({ level: 'silent' });
        // The changelog feature is production-only, so tests default to production and supply an
        // empty changelog set; the changelog router tests override these per caller.
        const callerContext: TesterContext = {
          createAnonCaller: () =>
            createAppRouterCaller(NOOP_ROUTER_DEPENDENCIES)({
              access: null,
              appEnv: 'production',
              auth,
              changelogLoader: () => [],
              db: databaseClient.db,
              log: testLog,
              mobileObservability: {},
              session: null,
              storage: new MemoryStorage(),
            }),
          createCaller: (session = mockSession(), overrides = {}) => {
            return createAppRouterCaller({
              contracting: { ...NOOP_ROUTER_DEPENDENCIES.contracting, ...overrides.contracting },
              equipment: { ...NOOP_ROUTER_DEPENDENCIES.equipment, ...overrides.equipment },
              transcriptions: { ...NOOP_ROUTER_DEPENDENCIES.transcriptions, ...overrides.transcriptions },
            })({
              access: overrides.access ?? createUserAccessSummaryForUser(session.user),
              appEnv: overrides.appEnv ?? 'production',
              auth,
              changelogLoader: overrides.changelogLoader ?? (() => []),
              db: databaseClient.db,
              log: testLog,
              mobileObservability: {},
              session,
              storage: new MemoryStorage(),
            });
          },
        };
        const context = await createContext({
          ...callerContext,
          cleanup: (cleanup) => cleanups.push(cleanup),
          databaseName,
          databaseUrl,
          db: databaseClient.db,
          auth,
        });

        await use({
          ...callerContext,
          ...context,
        });
      } finally {
        for (const cleanup of cleanups.toReversed()) {
          await cleanup();
        }

        await databaseClient.close();
      }
    });

  return testBase.extend<{ context: TesterContext & T }>({
    context:
      scope === 'file'
        ? // biome-ignore lint/correctness/noEmptyPattern: Vitest reads a fixture's dependencies from this pattern.
          [async ({}, use: (ctx: TesterContext & T) => Promise<void>) => provide(use), { scope: 'file' }]
        : async ({ task: _task }: TestContext, use: (ctx: TesterContext & T) => Promise<void>) => provide(use),
  });
}

class MemoryStorage implements StorageAdapter {
  private readonly objects = new Map<string, StoragePutInput>();

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async get(key: string): Promise<StoredObject> {
    const object = this.objects.get(key);

    if (!object) {
      throw new Error('Storage object not found');
    }

    return {
      body: toAsyncIterable(object.body),
      byteSize: object.byteSize,
      contentType: object.contentType,
    };
  }

  async put(input: StoragePutInput): Promise<void> {
    this.objects.set(input.key, input);
  }
}

async function* toAsyncIterable(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}
