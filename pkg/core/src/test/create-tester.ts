import { createDatabaseClient, type DatabaseClient, type Db, withTestDatabase } from '@pkg/db';
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
  { max = 2 }: { max?: number } = {},
): TestAPI<{ context: TesterScope & T }> {
  return testBase.extend<{ context: TesterScope & T }>({
    context: async ({ task: _task }: TestContext, use: (ctx: TesterScope & T) => Promise<void>) =>
      withTestDatabase(async ({ databaseName, databaseUrl }) => {
        const databaseClient = createDatabaseClient(databaseUrl, { max });

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
        }
      }),
  });
}
