import { createDatabaseClient, type DatabaseClient, type Db } from '@pkg/db';

import { getLanderConfig } from './env.js';

// The Lander reads @pkg/core services against its own lazy module-level DB client (ADR 0007). It is
// read-only and shares the environment's Postgres with the API; it never runs migrations.
let client: DatabaseClient | null = null;

function getClient(): DatabaseClient {
  client ??= createDatabaseClient(getLanderConfig().DATABASE_URL);

  return client;
}

export function getDb(): Db {
  return getClient().db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
}
