import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { schema } from './schema.js';

export function createDatabaseClient(databaseUrl: string) {
  const queryClient = postgres(databaseUrl, {
    max: 10,
  });

  const db = drizzle(queryClient, { schema });

  return {
    db,
    queryClient,
    close: () => queryClient.end(),
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
export type Db = DatabaseClient['db'];
