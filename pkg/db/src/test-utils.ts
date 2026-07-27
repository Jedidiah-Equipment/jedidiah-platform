import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { getDatabaseUrl } from './env.js';
import { schema } from './schema.js';

const migrationsFolder = new URL('../migrations', import.meta.url).pathname;
// Default names encode the owner PID so startup cleanup can distinguish dead runs from live workers.
const ephemeralTestDatabaseNamePattern = /^jedidiah_ephemeral_(\d+)_[a-f0-9]{12}$/;
const staleDatabaseSweepLockNamespace = 0x4a_45_44;
const staleDatabaseSweepLockKey = 1;
const createdEphemeralTestDatabases = new Map<string, string>();

export type EphemeralTestDatabase = {
  databaseName: string;
  databaseUrl: string;
};

export type RecreateTestTemplateDatabaseOptions = {
  databaseUrl?: string;
};

export type CreateEphemeralTestDatabaseOptions = {
  databaseName?: string;
  templateDatabaseUrl?: string;
};

export function getTestTemplateDatabaseUrl(): string {
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for the test template database');
  }

  return databaseUrl;
}

export function createTestDatabaseName(prefix: string): string {
  const suffix = `${process.pid}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const normalizedPrefix = prefix.replaceAll(/[^a-zA-Z0-9_]/g, '_');
  const prefixMaxLength = Math.max(1, 60 - suffix.length);
  const trimmedPrefix = normalizedPrefix.slice(0, prefixMaxLength);

  return `${trimmedPrefix}_${suffix}`;
}

export function buildDatabaseUrl(databaseName: string, databaseUrl = getDatabaseUrl()): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;

  return url.toString();
}

export async function recreateTestTemplateDatabase(): Promise<string> {
  const databaseUrl = getTestTemplateDatabaseUrl();
  const databaseName = getDatabaseName(databaseUrl);

  await recreateDatabase({ databaseName, databaseUrl });
  await migrateDatabase(databaseUrl);

  return databaseName;
}

export async function createEphemeralTestDatabase({
  databaseName = createTestDatabaseName('jedidiah_ephemeral'),
  templateDatabaseUrl = getTestTemplateDatabaseUrl(),
}: CreateEphemeralTestDatabaseOptions = {}): Promise<EphemeralTestDatabase> {
  const adminClient = createAdminClient(templateDatabaseUrl);
  const templateDatabaseName = getDatabaseName(templateDatabaseUrl);

  try {
    const quotedDatabaseName = quoteIdentifier(databaseName);
    const quotedTemplateDatabaseName = quoteIdentifier(templateDatabaseName);

    await adminClient.unsafe(`CREATE DATABASE ${quotedDatabaseName} TEMPLATE ${quotedTemplateDatabaseName}`);
    createdEphemeralTestDatabases.set(databaseName, templateDatabaseUrl);

    return {
      databaseName,
      databaseUrl: buildDatabaseUrl(databaseName, templateDatabaseUrl),
    };
  } finally {
    await adminClient.end();
  }
}

export async function dropTrackedTestDatabases(): Promise<void> {
  const trackedDatabases = [...createdEphemeralTestDatabases];
  const cleanupResults = await Promise.allSettled(
    trackedDatabases.map(([databaseName, databaseUrl]) => dropTestDatabase(databaseName, databaseUrl)),
  );
  const cleanupErrors = cleanupResults.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return [];
    }

    const databaseName = trackedDatabases[index]?.[0] ?? 'unknown';
    return [new Error(`Failed to drop tracked test database ${databaseName}`, { cause: result.reason })];
  });

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Failed to drop one or more tracked test databases');
  }
}

export async function sweepStaleTestDatabases(databaseUrl = getTestTemplateDatabaseUrl()): Promise<void> {
  const adminClient = createAdminClient(databaseUrl);
  const cleanupErrors: Error[] = [];

  try {
    // Turbo starts several DB-backed Vitest projects together; one sweeps while the others continue.
    const acquiredSweepLock = await tryAcquireStaleDatabaseSweepLock(adminClient);
    if (!acquiredSweepLock) {
      return;
    }

    try {
      const staleDatabaseNames = await listStaleTestDatabaseNames(adminClient);

      for (const databaseName of staleDatabaseNames) {
        try {
          await dropDatabaseIfExists(adminClient, databaseName);
        } catch (error) {
          cleanupErrors.push(new Error(`Failed to drop stale test database ${databaseName}`, { cause: error }));
        }
      }
    } finally {
      await releaseStaleDatabaseSweepLock(adminClient);
    }
  } finally {
    await adminClient.end();
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Failed to drop one or more stale test databases');
  }
}

async function listStaleTestDatabaseNames(adminClient: postgres.Sql): Promise<string[]> {
  const databases = await adminClient<{ databaseName: string }[]>`
    SELECT datname AS "databaseName"
    FROM pg_database
    WHERE datname LIKE 'jedidiah_ephemeral_%'
  `;

  return databases
    .filter(({ databaseName }) => {
      const ownerProcessId = getOwnerProcessId(databaseName);
      return ownerProcessId !== null && !isProcessAlive(ownerProcessId);
    })
    .map(({ databaseName }) => databaseName);
}

async function tryAcquireStaleDatabaseSweepLock(adminClient: postgres.Sql): Promise<boolean> {
  const lockResults = await adminClient<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(
      ${staleDatabaseSweepLockNamespace}::integer,
      ${staleDatabaseSweepLockKey}::integer
    ) AS "acquired"
  `;

  return lockResults[0]?.acquired ?? false;
}

async function releaseStaleDatabaseSweepLock(adminClient: postgres.Sql): Promise<void> {
  await adminClient`
    SELECT pg_advisory_unlock(
      ${staleDatabaseSweepLockNamespace}::integer,
      ${staleDatabaseSweepLockKey}::integer
    )
  `;
}

function getOwnerProcessId(databaseName: string): number | null {
  const match = ephemeralTestDatabaseNamePattern.exec(databaseName);
  const ownerProcessId = Number(match?.[1]);

  return Number.isSafeInteger(ownerProcessId) && ownerProcessId > 0 ? ownerProcessId : null;
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    // Only a confirmed missing process is safe to sweep; permission and platform errors stay untouched.
    // A recycled PID can defer cleanup, but an age override could drop a genuinely live long test run.
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

export async function dropTestDatabase(databaseName: string, databaseUrl = getTestTemplateDatabaseUrl()) {
  const adminClient = createAdminClient(databaseUrl);

  try {
    await dropDatabaseIfExists(adminClient, databaseName);
  } finally {
    await adminClient.end();
  }

  if (createdEphemeralTestDatabases.get(databaseName) === databaseUrl) {
    createdEphemeralTestDatabases.delete(databaseName);
  }
}

async function recreateDatabase({ databaseName, databaseUrl }: { databaseName: string; databaseUrl: string }) {
  const adminClient = createAdminClient(databaseUrl);

  try {
    await dropDatabaseIfExists(adminClient, databaseName);
    await adminClient.unsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await adminClient.end();
  }
}

async function migrateDatabase(databaseUrl: string): Promise<void> {
  const queryClient = postgres(databaseUrl, {
    max: 1,
  });
  const db = drizzle(queryClient, { schema });

  try {
    await migrate(db, {
      migrationsFolder,
    });
  } finally {
    await queryClient.end();
  }
}

async function terminateDatabaseConnections(adminClient: postgres.Sql, databaseName: string): Promise<void> {
  await adminClient`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = ${databaseName}
      AND pid <> pg_backend_pid()
  `;
}

async function dropDatabaseIfExists(adminClient: postgres.Sql, databaseName: string): Promise<void> {
  const existingDatabases = await adminClient<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1
      FROM pg_database
      WHERE datname = ${databaseName}
    ) AS "exists"
  `;

  if (!existingDatabases[0]?.exists) {
    return;
  }

  await terminateDatabaseConnections(adminClient, databaseName);
  await adminClient.unsafe(`DROP DATABASE ${quoteIdentifier(databaseName)}`);
}

function getDatabaseName(databaseUrl: string): string {
  const databaseName = new URL(databaseUrl).pathname.slice(1);

  if (!databaseName) {
    throw new Error(`Database URL must include a database name: ${databaseUrl}`);
  }

  return databaseName;
}

function createAdminClient(databaseUrl: string): postgres.Sql {
  return postgres(buildDatabaseUrl('postgres', databaseUrl), {
    max: 1,
  });
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid database identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}
