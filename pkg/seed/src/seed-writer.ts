import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import './load-db-env.js';
import { createDatabaseClient, type DatabaseTransaction, type Db, getDatabaseUrl } from '@pkg/db';
import { hashPassword } from 'better-auth/crypto';
import { deserializeSnapshotRows } from './snapshot-json.js';
import { snapshotDirectory } from './snapshot-paths.js';
import {
  projectWritableRow,
  type SnapshotRow,
  type SnapshotTableConfig,
  snapshotCleanupTables,
  snapshotTables,
} from './snapshot-tables.js';

const insertBatchSize = 500;

// Shared local login for every snapshot-seeded user. Staging password hashes are never dumped (see the
// account config); the seeder fills credential accounts with this on insert so any seeded user can log in.
export const SEED_USER_PASSWORD = 'test123';

function assertLocalDatabaseIsNotStaging(localDatabaseUrl: string): void {
  const stagingDatabaseUrl = process.env.STAGING_DATABASE_URL;

  if (stagingDatabaseUrl && normalizeDatabaseUrl(localDatabaseUrl) === normalizeDatabaseUrl(stagingDatabaseUrl)) {
    throw new Error('Refusing to write seed snapshot because DATABASE_URL matches STAGING_DATABASE_URL.');
  }
}

function normalizeDatabaseUrl(databaseUrl: string): string {
  return new URL(databaseUrl).href;
}

async function readSnapshotFile(config: SnapshotTableConfig): Promise<SnapshotRow[]> {
  const snapshotFile = new URL(config.fileName, snapshotDirectory);

  try {
    return deserializeSnapshotRows(config, await readFile(snapshotFile, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Missing seed snapshot file: ${snapshotFile.pathname}`, { cause: error });
    }

    throw error;
  }
}

export async function writeLocalSeedSnapshot(database?: Db): Promise<void> {
  const localDatabaseUrl = getDatabaseUrl();
  assertLocalDatabaseIsNotStaging(localDatabaseUrl);

  const snapshots = await Promise.all(
    snapshotTables.map(async (config) => ({
      config,
      rows: (await readSnapshotFile(config)).map((row) => projectWritableRow(config, row)),
    })),
  );
  const localClient = database ? null : createDatabaseClient(localDatabaseUrl);
  const writableDb = database ?? localClient?.db;

  if (!writableDb) {
    throw new Error('Unable to create local seed database client.');
  }

  const seedPasswordHash = await hashPassword(SEED_USER_PASSWORD);

  try {
    await writableDb.transaction(async (tx) => {
      await clearSnapshotTables(tx);

      for (const { config, rows } of snapshots) {
        const seedRows = (config as SnapshotTableConfig).seedCredentialPassword
          ? withSeedPassword(rows, seedPasswordHash)
          : rows;
        await insertSnapshotRows(tx, config, seedRows);
        console.info(`[db:seed] Imported ${seedRows.length} ${config.tableName} row(s)`);
      }
    });
  } finally {
    await localClient?.close();
  }
}

// Give every credential account the shared known password so any seeded user can log in locally. The same
// hash is reused across rows — better-auth embeds the salt in the hash, so a single value is sufficient.
function withSeedPassword(rows: readonly SnapshotRow[], passwordHash: string): SnapshotRow[] {
  return rows.map((row) => (row.providerId === 'credential' ? { ...row, password: passwordHash } : row));
}

async function clearSnapshotTables(tx: DatabaseTransaction): Promise<void> {
  for (const config of snapshotCleanupTables) {
    await tx.delete(config.table);
  }
}

async function insertSnapshotRows(
  tx: DatabaseTransaction,
  config: SnapshotTableConfig,
  rows: readonly SnapshotRow[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += insertBatchSize) {
    const batch = rows.slice(index, index + insertBatchSize);

    if (batch.length > 0) {
      await tx.insert(config.table).values(batch);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await writeLocalSeedSnapshot();
}
