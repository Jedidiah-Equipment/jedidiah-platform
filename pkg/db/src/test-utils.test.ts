import { describe, expect, it } from "vitest";

import { createDatabaseClient } from "./database-client.js";
import { products } from "./schema/index.js";
import {
  createEphemeralTestDatabase,
  createTestDatabaseName,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from "./test-utils.js";

describe("test database utilities", () => {
  it("clones migrated template databases with isolated data", async () => {
    const templateDatabaseUrl = getTestTemplateDatabaseUrl();
    const firstDatabase = await createEphemeralTestDatabase({
      databaseName: createTestDatabaseName("jedidiah_util_one"),
      templateDatabaseUrl,
    });
    const secondDatabase = await createEphemeralTestDatabase({
      databaseName: createTestDatabaseName("jedidiah_util_two"),
      templateDatabaseUrl,
    });
    const firstClient = createDatabaseClient(firstDatabase.databaseUrl);
    const secondClient = createDatabaseClient(secondDatabase.databaseUrl);

    try {
      await firstClient.db.insert(products).values({ name: "Only First Clone" });

      const firstProducts = await firstClient.db.select().from(products);
      const secondProducts = await secondClient.db.select().from(products);

      expect(firstProducts).toHaveLength(1);
      expect(secondProducts).toHaveLength(0);
    } finally {
      await firstClient.close();
      await secondClient.close();
      await dropTestDatabase(firstDatabase.databaseName, templateDatabaseUrl);
      await dropTestDatabase(secondDatabase.databaseName, templateDatabaseUrl);
    }
  });
});
