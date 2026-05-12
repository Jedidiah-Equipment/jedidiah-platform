import { createDatabaseClient, type Database, type DatabaseClient } from "@pkg/db/database-client";
import {
  createEphemeralTestDatabase,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from "@pkg/db/test-utils";
import { type TestAPI, type TestContext, test as testBase } from "vitest";

type Cleanup = () => Promise<void> | void;

export type TesterScope = {
  cleanup: (cleanup: Cleanup) => void;
  databaseClient: DatabaseClient;
  databaseName: string;
  databaseUrl: string;
  db: Database;
};

export class Tester<T> {
  constructor(private readonly createContext: (scope: TesterScope) => Promise<T> | T) {}

  get test(): TestAPI<{ context: T }> {
    const createContext = this.createContext;

    return testBase.extend<{ context: T }>({
      context: async ({ task: _task }: TestContext, use: (ctx: T) => Promise<void>) => {
        const templateDatabaseUrl = getTestTemplateDatabaseUrl();
        const { databaseName, databaseUrl } = await createEphemeralTestDatabase({
          templateDatabaseUrl,
        });
        const databaseClient = createDatabaseClient(databaseUrl);
        const cleanups: Cleanup[] = [];

        try {
          try {
            const context = await createContext({
              cleanup: (cleanup) => cleanups.push(cleanup),
              databaseClient,
              databaseName,
              databaseUrl,
              db: databaseClient.db,
            });

            await use(context);
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
}
