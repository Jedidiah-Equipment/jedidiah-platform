import { fileURLToPath, pathToFileURL } from 'node:url';
import './load-write-env.js';
import './load-read-env.js';
import { createDatabaseClient, type Db } from '@pkg/db';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolveStagingResetDatabaseUrl } from './seed-target-guards.js';
import { seedDemoUsers } from './seed-users.js';

export async function resetRemoteDatabase(database: Db): Promise<void> {
  await database.execute(sql`
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    DROP SCHEMA IF EXISTS equipment CASCADE;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
    GRANT ALL ON SCHEMA public TO CURRENT_USER;
  `);

  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)),
  });

  await seedDemoUsers(database);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const client = createDatabaseClient(resolveStagingResetDatabaseUrl());

  try {
    await resetRemoteDatabase(client.db);
  } finally {
    await client.close();
  }
}
