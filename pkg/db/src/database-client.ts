import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { schema } from './schema.js';

export type CreateDatabaseClientOptions = {
  /** Pool cap. Tests pass a small cap so parallel workers stay clear of Postgres max_connections. */
  max?: number;
};

export function createDatabaseClient(databaseUrl: string, { max = 10 }: CreateDatabaseClientOptions = {}) {
  const queryClient = postgres(databaseUrl, {
    max,
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
