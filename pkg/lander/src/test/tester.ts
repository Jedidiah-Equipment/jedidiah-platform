import {
  createDatabaseClient,
  createEphemeralTestDatabase,
  type Db,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from '@pkg/db';
import { test as testBase } from 'vitest';

// Per-test ephemeral database cloned from the seeded template, mirroring @pkg/core's `createTester`.
// External adapters (S3, Resend) are not exercised by the Lander loader tests, so none are injected.
export const test = testBase.extend<{ db: Db }>({
  db: async ({ task: _task }, use) => {
    const templateDatabaseUrl = getTestTemplateDatabaseUrl();
    const { databaseName, databaseUrl } = await createEphemeralTestDatabase({ templateDatabaseUrl });
    const client = createDatabaseClient(databaseUrl);

    try {
      await use(client.db);
    } finally {
      await client.close();
      await dropTestDatabase(databaseName, templateDatabaseUrl);
    }
  },
});
