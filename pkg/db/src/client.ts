import { createDatabaseClient, type DatabaseClient, type Db } from './database-client.js';
import { getDatabaseUrl } from './env.js';

let defaultClient: DatabaseClient | null = null;

function getDefaultClient(): DatabaseClient {
  // Under test the default URL is the template every ephemeral database clones from; a session left on it
  // makes concurrent clones fail with "source database is being accessed by other users".
  if (process.env.VITEST) {
    throw new Error('The default database client is unavailable under Vitest; use an ephemeral test database');
  }

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
