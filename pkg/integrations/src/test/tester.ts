import {
  createDatabaseClient,
  createEphemeralTestDatabase,
  type Db,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from '@pkg/db';
import { test as testBase } from 'vitest';

// Per-test ephemeral database cloned from the migrated template, mirroring @pkg/core's `createTester`.
export const test = testBase.extend<{ db: Db }>({
  db: async ({ task: _task }, use) => {
    const templateDatabaseUrl = getTestTemplateDatabaseUrl();
    const { databaseName, databaseUrl } = await createEphemeralTestDatabase({ templateDatabaseUrl });
    const client = createDatabaseClient(databaseUrl, { max: 2 });

    try {
      await use(client.db);
    } finally {
      await client.close();
      await dropTestDatabase(databaseName, templateDatabaseUrl);
    }
  },
});
