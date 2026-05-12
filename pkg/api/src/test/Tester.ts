import {
  buildDatabaseUrl,
  createClonedTestDatabase,
  createMigratedTestDatabaseTemplate,
  createTestDatabaseName,
  dropTestDatabase,
  getTestDatabaseUrl,
  withTestDatabaseUrl,
} from "@pkg/db/test-utils";
import { afterAll, type TestAPI, type TestContext, test as testBase, vi } from "vitest";

type Cleanup = () => Promise<void> | void;

export type TesterScope = {
  cleanup: (cleanup: Cleanup) => void;
  databaseName: string;
  databaseUrl: string;
};

type TemplateInfo = {
  databaseUrl: string;
  name: string;
};

export class Tester<T> {
  private static cleanupRegistered = false;
  private static templatePromises = new Map<string, Promise<string>>();
  private static templates: TemplateInfo[] = [];

  constructor(private readonly createContext: (scope: TesterScope) => Promise<T> | T) {
    Tester.registerTemplateCleanup();
  }

  get test(): TestAPI<{ context: T }> {
    const createContext = this.createContext;

    return testBase.extend<{ context: T }>({
      context: async ({ task: _task }: TestContext, use: (ctx: T) => Promise<void>) => {
        const sourceDatabaseUrl = getSourceDatabaseUrl();
        const templateName = await Tester.getTemplateName(sourceDatabaseUrl);
        const databaseName = createTestDatabaseName();

        await createClonedTestDatabase({
          databaseName,
          databaseUrl: sourceDatabaseUrl,
          templateName,
        });

        const databaseUrl = buildDatabaseUrl(databaseName, sourceDatabaseUrl);
        const cleanups: Cleanup[] = [];

        try {
          await withTestDatabaseUrl(databaseUrl, async () => {
            vi.resetModules();

            try {
              const context = await createContext({
                cleanup: (cleanup) => cleanups.push(cleanup),
                databaseName,
                databaseUrl,
              });

              await use(context);
            } finally {
              for (const cleanup of cleanups.toReversed()) {
                await cleanup();
              }

              vi.resetModules();
            }
          });
        } finally {
          await dropTestDatabase(databaseName, sourceDatabaseUrl);
        }
      },
    });
  }

  private static getTemplateName(databaseUrl: string): Promise<string> {
    const existingTemplate = Tester.templatePromises.get(databaseUrl);

    if (existingTemplate) {
      return existingTemplate;
    }

    const templatePromise = createMigratedTestDatabaseTemplate({ databaseUrl }).then((name) => {
      Tester.templates.push({ databaseUrl, name });
      return name;
    });

    Tester.templatePromises.set(databaseUrl, templatePromise);

    return templatePromise;
  }

  private static registerTemplateCleanup(): void {
    if (Tester.cleanupRegistered) {
      return;
    }

    Tester.cleanupRegistered = true;

    afterAll(async () => {
      for (const template of Tester.templates.toReversed()) {
        await dropTestDatabase(template.name, template.databaseUrl);
      }
    });
  }
}

function getSourceDatabaseUrl(): string {
  return getTestDatabaseUrl();
}
