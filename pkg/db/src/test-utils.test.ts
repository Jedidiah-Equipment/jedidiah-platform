import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildDatabaseUrl,
  createEphemeralTestDatabase,
  createTestDatabaseName,
  dropTestDatabase,
  dropTrackedTestDatabases,
  getTestTemplateDatabaseUrl,
  sweepStaleTestDatabases,
} from './test-utils.js';

const databaseNamesToCleanUp = new Set<string>();

afterEach(async () => {
  const databaseNames = [...databaseNamesToCleanUp];

  try {
    const cleanupResults = await Promise.allSettled(
      databaseNames.map((databaseName) => dropTestDatabase(databaseName)),
    );
    const cleanupErrors = cleanupResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [];
      }

      return [
        new Error(`Failed to clean up test database ${databaseNames[index] ?? 'unknown'}`, {
          cause: result.reason,
        }),
      ];
    });

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Failed to clean up one or more test databases');
    }
  } finally {
    databaseNamesToCleanUp.clear();
  }
});

describe('ephemeral test database cleanup', () => {
  it('drains a tracked database left by a skipped fixture teardown', async () => {
    const databaseName = createTestDatabaseName('jedidiah_ephemeral');
    databaseNamesToCleanUp.add(databaseName);

    await createEphemeralTestDatabase({ databaseName });

    await dropTrackedTestDatabases();

    expect(await databaseExists(databaseName)).toBe(false);
  });

  it('sweeps databases owned by dead processes without affecting a live process', async () => {
    const deadProcessDatabaseName = `jedidiah_ephemeral_${getExitedProcessId()}_${createDatabaseNameSuffix()}`;
    const liveProcessDatabaseName = createTestDatabaseName('jedidiah_ephemeral');
    databaseNamesToCleanUp.add(deadProcessDatabaseName);
    databaseNamesToCleanUp.add(liveProcessDatabaseName);

    await createUntrackedDatabase(deadProcessDatabaseName);
    await createUntrackedDatabase(liveProcessDatabaseName);

    await sweepStaleTestDatabases();

    expect(await databaseExists(deadProcessDatabaseName)).toBe(false);
    expect(await databaseExists(liveProcessDatabaseName)).toBe(true);
  });

  it('allows concurrent sweep sessions to clean the same stale database', async () => {
    const staleDatabaseName = `jedidiah_ephemeral_${getExitedProcessId()}_${createDatabaseNameSuffix()}`;
    databaseNamesToCleanUp.add(staleDatabaseName);
    await createUntrackedDatabase(staleDatabaseName);

    await Promise.all([sweepStaleTestDatabases(), sweepStaleTestDatabases()]);

    expect(await databaseExists(staleDatabaseName)).toBe(false);
  });
});

function createDatabaseNameSuffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12);
}

function getExitedProcessId(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)'], {
    stdio: 'ignore',
  });

  if (child.error || child.status !== 0 || !child.pid) {
    throw child.error ?? new Error('Failed to create an exited child process for the test');
  }

  return child.pid;
}

async function createUntrackedDatabase(databaseName: string): Promise<void> {
  const adminClient = createAdminClient();
  const templateDatabaseName = new URL(getTestTemplateDatabaseUrl()).pathname.slice(1);

  try {
    await adminClient.unsafe(`CREATE DATABASE "${databaseName}" TEMPLATE "${templateDatabaseName}"`);
  } finally {
    await adminClient.end();
  }
}

async function databaseExists(databaseName: string): Promise<boolean> {
  const adminClient = createAdminClient();

  try {
    const databases = await adminClient<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1
        FROM pg_database
        WHERE datname = ${databaseName}
      ) AS "exists"
    `;

    return databases[0]?.exists ?? false;
  } finally {
    await adminClient.end();
  }
}

function createAdminClient(): postgres.Sql {
  return postgres(buildDatabaseUrl('postgres', getTestTemplateDatabaseUrl()), {
    max: 1,
  });
}
