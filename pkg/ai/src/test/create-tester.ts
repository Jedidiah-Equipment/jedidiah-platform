import type { StorageAdapter, StoragePutInput, StoredObject } from '@pkg/core';
import {
  createDatabaseClient,
  createEphemeralTestDatabase,
  type Db,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from '@pkg/db';
import pino from 'pino';
import { type TestAPI, type TestContext, test as testBase, vi } from 'vitest';

import type { AiContext } from '../context.js';
import { mockSession } from './test-utils.js';

type Cleanup = () => Promise<void> | void;

export type TesterScope = {
  cleanup: (cleanup: Cleanup) => void;
  createAiContext: (overrides?: Partial<AiContext>) => AiContext;
  databaseName: string;
  databaseUrl: string;
  db: Db;
};

type CreateTesterContext<T extends object> = (scope: TesterScope) => Promise<T> | T;

export function createTester<T extends object = Record<string, never>>(
  createContext: CreateTesterContext<T> = () => ({}) as T,
): TestAPI<{ context: TesterScope & T }> {
  return testBase.extend<{ context: TesterScope & T }>({
    context: async ({ task: _task }: TestContext, use: (ctx: TesterScope & T) => Promise<void>) => {
      const templateDatabaseUrl = getTestTemplateDatabaseUrl();
      const { databaseName, databaseUrl } = await createEphemeralTestDatabase({
        templateDatabaseUrl,
      });
      const databaseClient = createDatabaseClient(databaseUrl);
      const cleanups: Cleanup[] = [];

      try {
        try {
          const testLog = pino({ level: 'silent' });
          const createAiContext = (overrides: Partial<AiContext> = {}): AiContext => ({
            access: null,
            db: databaseClient.db,
            deliverQuoteDraftEmail: vi.fn(async () => ({ recipientEmail: 'test@example.com', warnings: [] })),
            log: testLog,
            session: mockSession(),
            storage: new MemoryStorage(),
            ...overrides,
          });
          const scope: TesterScope = {
            cleanup: (cleanup) => cleanups.push(cleanup),
            createAiContext,
            databaseName,
            databaseUrl,
            db: databaseClient.db,
          };
          const context = await createContext(scope);

          await use({
            ...scope,
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

export class MemoryStorage implements StorageAdapter {
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
