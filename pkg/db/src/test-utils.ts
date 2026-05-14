import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { getDatabaseUrl } from './env.js';
import * as schema from './schema/index.js';

const migrationsFolder = new URL('../migrations', import.meta.url).pathname;

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

    return {
      databaseName,
      databaseUrl: buildDatabaseUrl(databaseName, templateDatabaseUrl),
    };
  } finally {
    await adminClient.end();
  }
}

export async function dropTestDatabase(databaseName: string, databaseUrl = getTestTemplateDatabaseUrl()) {
  const adminClient = createAdminClient(databaseUrl);

  try {
    await dropDatabaseIfExists(adminClient, databaseName);
  } finally {
    await adminClient.end();
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
