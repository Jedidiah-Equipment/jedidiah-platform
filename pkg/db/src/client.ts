import { createDatabaseClient } from './database-client.js';
import { getDatabaseUrl } from './env.js';

const defaultClient = createDatabaseClient(getDatabaseUrl());

export const queryClient = defaultClient.queryClient;
export const db = defaultClient.db;

export async function closeDatabaseConnection(): Promise<void> {
  await defaultClient.close();
}
