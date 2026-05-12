import { describe, expect, it } from "vitest";
import { createDatabaseClient } from "./database-client.js";
import { products } from "./schema/index.js";
import {
  buildDatabaseUrl,
  createClonedTestDatabase,
  createMigratedTestDatabaseTemplate,
  createTestDatabaseName,
  dropTestDatabase,
  getTestDatabaseUrl,
  setDefaultDatabaseTestEnv,
} from "./test-utils.js";

setDefaultDatabaseTestEnv();

describe("test database utilities", () => {
  it("clones migrated databases with isolated data", async () => {
    const sourceDatabaseUrl = getTestDatabaseUrl();

    const templateName = await createMigratedTestDatabaseTemplate({
      databaseUrl: sourceDatabaseUrl,
      templateName: createTestDatabaseName("app_test_template_util"),
    });
    const firstDatabaseName = await createClonedTestDatabase({
      databaseUrl: sourceDatabaseUrl,
      databaseName: createTestDatabaseName("app_test_util_one"),
      templateName,
    });
    const secondDatabaseName = await createClonedTestDatabase({
      databaseUrl: sourceDatabaseUrl,
      databaseName: createTestDatabaseName("app_test_util_two"),
      templateName,
    });
    const firstClient = createDatabaseClient(
      buildDatabaseUrl(firstDatabaseName, sourceDatabaseUrl),
    );
    const secondClient = createDatabaseClient(
      buildDatabaseUrl(secondDatabaseName, sourceDatabaseUrl),
    );

    try {
      await firstClient.db.insert(products).values({ name: "Only First Clone" });

      const firstProducts = await firstClient.db.select().from(products);
      const secondProducts = await secondClient.db.select().from(products);

      expect(firstProducts).toHaveLength(1);
      expect(secondProducts).toHaveLength(0);
    } finally {
      await firstClient.close();
      await secondClient.close();
      await dropTestDatabase(firstDatabaseName, sourceDatabaseUrl);
      await dropTestDatabase(secondDatabaseName, sourceDatabaseUrl);
      await dropTestDatabase(templateName, sourceDatabaseUrl);
    }
  });
});
