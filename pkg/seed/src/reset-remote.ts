import { fileURLToPath, pathToFileURL } from 'node:url';
import './load-db-env.js';
import { closeDatabaseConnection, db } from '@pkg/db';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { seedDatabase } from './seed.js';

const stagingResetConfirmation = 'staging';

function assertRemoteResetIsConfirmed(): void {
  if (process.env.APP_ENV !== 'staging') {
    throw new Error('Remote database reset requires APP_ENV=staging.');
  }

  if (process.env.CONFIRM_DB_RESET !== stagingResetConfirmation) {
    throw new Error(`Remote database reset requires CONFIRM_DB_RESET=${stagingResetConfirmation}.`);
  }
}

async function resetRemoteDatabase(): Promise<void> {
  assertRemoteResetIsConfirmed();

  await db.execute(sql`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
    GRANT ALL ON SCHEMA public TO CURRENT_USER;
  `);

  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)),
  });

  await seedDatabase(db);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await resetRemoteDatabase();
  } finally {
    await closeDatabaseConnection();
  }
}
