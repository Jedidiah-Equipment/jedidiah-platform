import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { closeDatabaseConnection, db } from './client.js';

await migrate(db, {
  migrationsFolder: 'migrations',
});

await closeDatabaseConnection();
