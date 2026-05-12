import { createDatabaseClient, type Database, type DatabaseClient } from "@pkg/db/database-client";
import {
  createEphemeralTestDatabase,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from "@pkg/db/test-utils";
import { type TestAPI, type TestContext, test as testBase } from "vitest";

import type { Context } from "@/trpc/context.js";
import { type AppRouter, createAppRouterCaller } from "@/trpc/router.js";

import { mockSession } from "./test-utils.js";

type Cleanup = () => Promise<void> | void;
export type AppRouterCaller = ReturnType<AppRouter["createCaller"]>;

export type TesterScope = {
  cleanup: (cleanup: Cleanup) => void;
  databaseClient: DatabaseClient;
  databaseName: string;
  databaseUrl: string;
  db: Database;
};

export type TesterContext = {
  createAnonCaller: () => AppRouterCaller;
  createCaller: (session?: Context["session"]) => AppRouterCaller;
};

type CreateTesterContext<T extends object> = (scope: TesterScope & TesterContext) => Promise<T> | T;

export function createTester<T extends object = Record<string, never>>(
  createContext: CreateTesterContext<T> = () => ({}) as T,
): TestAPI<{ context: TesterContext & T }> {
  return testBase.extend<{ context: TesterContext & T }>({
    context: async (
      { task: _task }: TestContext,
      use: (ctx: TesterContext & T) => Promise<void>,
    ) => {
      const templateDatabaseUrl = getTestTemplateDatabaseUrl();
      const { databaseName, databaseUrl } = await createEphemeralTestDatabase({
        templateDatabaseUrl,
      });
      const databaseClient = createDatabaseClient(databaseUrl);
      const cleanups: Cleanup[] = [];

      try {
        try {
          const callerContext: TesterContext = {
            createAnonCaller: () =>
              createAppRouterCaller({
                db: databaseClient.db,
                req: {} as Context["req"],
                session: null,
              }),
            createCaller: (session = mockSession()) =>
              createAppRouterCaller({
                db: databaseClient.db,
                req: {} as Context["req"],
                session,
              }),
          };
          const context = await createContext({
            ...callerContext,
            cleanup: (cleanup) => cleanups.push(cleanup),
            databaseClient,
            databaseName,
            databaseUrl,
            db: databaseClient.db,
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
