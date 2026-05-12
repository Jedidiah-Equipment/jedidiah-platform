import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { createDatabaseClient } from "./database-client.js";
import { getDatabaseUrl } from "./env.js";
import * as schema from "./schema/index.js";

const migrationsFolder = new URL("../migrations", import.meta.url).pathname;
const defaultTestDatabaseUrl = "postgres://app:app@localhost:5432/app_test";

export function setDefaultDatabaseTestEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://app:app@localhost:5432/app_dev";
  process.env.TEST_DATABASE_URL ??= defaultTestDatabaseUrl;
}

export function getTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl;
}

export async function withTestDatabaseUrl<T>(
  databaseUrl: string,
  callback: () => Promise<T>,
): Promise<T> {
  const previousTestDatabaseUrl = process.env.TEST_DATABASE_URL;

  process.env.TEST_DATABASE_URL = databaseUrl;

  try {
    return await callback();
  } finally {
    if (previousTestDatabaseUrl) {
      process.env.TEST_DATABASE_URL = previousTestDatabaseUrl;
    } else {
      delete process.env.TEST_DATABASE_URL;
    }
  }
}

export async function resetTestDatabase(): Promise<void> {
  const { db, close } = createDatabaseClient(getDatabaseUrl());

  try {
    await db.execute(
      sql.raw(
        'TRUNCATE TABLE "products", "account", "session", "verification", "user" RESTART IDENTITY',
      ),
    );
  } finally {
    await close();
  }
}

export type TestDatabaseTemplateOptions = {
  databaseUrl?: string;
  templateName?: string;
};

export type TestDatabaseCloneOptions = {
  databaseUrl?: string;
  databaseName?: string;
  templateName: string;
};

export function createTestDatabaseName(prefix = "app_test"): string {
  const suffix = `${process.pid}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const normalizedPrefix = prefix.replaceAll(/[^a-zA-Z0-9_]/g, "_");
  const prefixMaxLength = Math.max(1, 60 - suffix.length);
  const trimmedPrefix = normalizedPrefix.slice(0, prefixMaxLength);

  return `${trimmedPrefix}_${suffix}`;
}

export function buildDatabaseUrl(databaseName: string, databaseUrl = getDatabaseUrl()): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;

  return url.toString();
}

export async function createMigratedTestDatabaseTemplate({
  databaseUrl = getDatabaseUrl(),
  templateName = createTestDatabaseName("app_test_template"),
}: TestDatabaseTemplateOptions = {}): Promise<string> {
  await recreateDatabase({ databaseName: templateName, databaseUrl });
  await migrateDatabase(buildDatabaseUrl(templateName, databaseUrl));

  return templateName;
}

export async function createClonedTestDatabase({
  databaseUrl = getDatabaseUrl(),
  databaseName = createTestDatabaseName(),
  templateName,
}: TestDatabaseCloneOptions): Promise<string> {
  const adminClient = createAdminClient(databaseUrl);

  try {
    const quotedDatabaseName = quoteIdentifier(databaseName);
    const quotedTemplateName = quoteIdentifier(templateName);

    await adminClient.unsafe(
      `CREATE DATABASE ${quotedDatabaseName} TEMPLATE ${quotedTemplateName}`,
    );

    return databaseName;
  } finally {
    await adminClient.end();
  }
}

export async function dropTestDatabase(databaseName: string, databaseUrl = getDatabaseUrl()) {
  const adminClient = createAdminClient(databaseUrl);

  try {
    await dropDatabaseIfExists(adminClient, databaseName);
  } finally {
    await adminClient.end();
  }
}

async function recreateDatabase({
  databaseName,
  databaseUrl,
}: {
  databaseName: string;
  databaseUrl: string;
}) {
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

async function terminateDatabaseConnections(
  adminClient: postgres.Sql,
  databaseName: string,
): Promise<void> {
  await adminClient`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = ${databaseName}
      AND pid <> pg_backend_pid()
  `;
}

async function dropDatabaseIfExists(
  adminClient: postgres.Sql,
  databaseName: string,
): Promise<void> {
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

function createAdminClient(databaseUrl: string): postgres.Sql {
  return postgres(buildDatabaseUrl("postgres", databaseUrl), {
    max: 1,
  });
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid database identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}
