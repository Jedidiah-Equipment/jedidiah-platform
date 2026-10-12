import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

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

describe('ephemeral test database clone', () => {
  it('retries a clone refused while another session holds the template', async () => {
    const templateDatabaseName = createTestDatabaseName('jedidiah_scratch_template');
    const databaseName = createTestDatabaseName('jedidiah_ephemeral');
    databaseNamesToCleanUp.add(templateDatabaseName);
    databaseNamesToCleanUp.add(databaseName);
    await createUntrackedDatabase(templateDatabaseName);
    const templateDatabaseUrl = buildDatabaseUrl(templateDatabaseName, getTestTemplateDatabaseUrl());
    const holder = postgres(templateDatabaseUrl, { max: 1 });

    try {
      await holder`SELECT 1`;
      const clone = createEphemeralTestDatabase({ databaseName, templateDatabaseUrl });
      const stopWatching = new AbortController();
      // Postgres waits ~5s before refusing the first attempt; a second CREATE DATABASE proves the retry.
      const watching = waitForCloneAttempts(databaseName, 2, stopWatching.signal);

      try {
        await Promise.race([watching, clone]);
      } finally {
        stopWatching.abort();
        await watching;
      }

      await holder.end();
      await clone;
    } finally {
      await holder.end();
    }

    expect(await databaseExists(databaseName)).toBe(true);
  });

  it('rethrows a clone failure that is not a busy template', async () => {
    const templateDatabaseUrl = buildDatabaseUrl(
      createTestDatabaseName('jedidiah_missing'),
      getTestTemplateDatabaseUrl(),
    );

    await expect(createEphemeralTestDatabase({ templateDatabaseUrl })).rejects.toMatchObject({ code: '3D000' });
  });
});

async function waitForCloneAttempts(databaseName: string, attempts: number, signal: AbortSignal): Promise<void> {
  const adminClient = createAdminClient();
  const attemptStarts = new Set<string>();

  try {
    while (attemptStarts.size < attempts && !signal.aborted) {
      const clones = await adminClient<{ queryStart: string }[]>`
        SELECT query_start::text AS "queryStart"
        FROM pg_stat_activity
        WHERE state = 'active'
          AND query LIKE ${`CREATE DATABASE "${databaseName}" %`}
      `;
      for (const { queryStart } of clones) attemptStarts.add(queryStart);
      await setTimeout(50);
    }
  } finally {
    await adminClient.end();
  }
}

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
