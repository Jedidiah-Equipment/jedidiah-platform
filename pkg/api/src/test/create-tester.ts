import type { StorageAdapter, StoragePutInput, StoredObject } from '@pkg/core';
import {
  createDatabaseClient,
  createEphemeralTestDatabase,
  type Db,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import pino from 'pino';
import { type TestAPI, type TestContext, test as testBase } from 'vitest';

import { type Auth, createAuth } from '@/auth/auth.js';
import { parseBetterAuthRole } from '@/auth/session.js';
import type { Context } from '@/trpc/context.js';
import { type AppRouter, createAppRouterCaller } from '@/trpc/router.js';

import { mockSession } from './test-utils.js';

type Cleanup = () => Promise<void> | void;
export type AppRouterCaller = ReturnType<AppRouter['createCaller']>;

export type TesterScope = {
  auth: Auth;
  cleanup: (cleanup: Cleanup) => void;
  databaseName: string;
  databaseUrl: string;
  db: Db;
};

export type TesterContext = {
  createAnonCaller: () => AppRouterCaller;
  createCaller: (session?: NonNullable<Context['session']>) => AppRouterCaller;
};

type CreateTesterContext<T extends object> = (scope: TesterScope & TesterContext) => Promise<T> | T;

export function createTester<T extends object = Record<string, never>>(
  createContext: CreateTesterContext<T> = () => ({}) as T,
): TestAPI<{ context: TesterContext & T }> {
  return testBase.extend<{ context: TesterContext & T }>({
    context: async ({ task: _task }: TestContext, use: (ctx: TesterContext & T) => Promise<void>) => {
      const templateDatabaseUrl = getTestTemplateDatabaseUrl();
      const { databaseName, databaseUrl } = await createEphemeralTestDatabase({
        templateDatabaseUrl,
      });
      const databaseClient = createDatabaseClient(databaseUrl);
      const auth = createAuth(databaseClient.db);
      const cleanups: Cleanup[] = [];

      try {
        try {
          const testLog = pino({ level: 'silent' });
          const callerContext: TesterContext = {
            createAnonCaller: () =>
              createAppRouterCaller({
                access: null,
                db: databaseClient.db,
                log: testLog,
                session: null,
                storage: new MemoryStorage(),
              }),
            createCaller: (session = mockSession()) => {
              return createAppRouterCaller({
                access: createUserAccessSummary({
                  role: parseBetterAuthRole(session.user.role),
                  userId: session.user.id,
                }),
                db: databaseClient.db,
                log: testLog,
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
      } finally {
        await dropTestDatabase(databaseName, templateDatabaseUrl);
      }
    },
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
