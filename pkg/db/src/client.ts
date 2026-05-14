import { createDatabaseClient, type DatabaseClient, type Db } from './database-client.js';
import { getDatabaseUrl } from './env.js';

let defaultClient: DatabaseClient | null = null;

function getDefaultClient(): DatabaseClient {
  defaultClient ??= createDatabaseClient(getDatabaseUrl());

  return defaultClient;
}

function createLazyProxy<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = getTarget();
      const value = target[property as keyof T];

      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const queryClient = createLazyProxy<DatabaseClient['queryClient']>(() => getDefaultClient().queryClient);
export const db = createLazyProxy<Db>(() => getDefaultClient().db);

export async function closeDatabaseConnection(): Promise<void> {
  await defaultClient?.close();
  defaultClient = null;
}
