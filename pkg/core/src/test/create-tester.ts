import {
  createDatabaseClient,
  createEphemeralTestDatabase,
  type DatabaseClient,
  type Db,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from '@pkg/db';
import { type TestAPI, type TestContext, test as testBase } from 'vitest';

export type TesterScope = {
  databaseClient: DatabaseClient;
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

      try {
        const context = await createContext({
          databaseClient,
          databaseName,
          databaseUrl,
          db: databaseClient.db,
        });

        await use({
          databaseClient,
          databaseName,
          databaseUrl,
          db: databaseClient.db,
          ...context,
        });
      } finally {
        await databaseClient.close();
        await dropTestDatabase(databaseName, templateDatabaseUrl);
      }
    },
  });
}
