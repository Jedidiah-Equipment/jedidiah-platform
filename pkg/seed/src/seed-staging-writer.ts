import { pathToFileURL } from 'node:url';
import './load-write-env.js';
import './load-read-env.js';
import { createDatabaseClient } from '@pkg/db';
import { readSnapshotTableRows } from './seed-reader.js';
import { resolveStagingSeedConfig } from './seed-target-guards.js';
import { prepareRowsForSeed, replaceDatabaseWithSeedSnapshot, type SnapshotWithRows } from './seed-writer.js';
import { collectStorageFiles, snapshotTables } from './snapshot-tables.js';
import { createStorage, downloadObject, type SeedStorage, uploadObject } from './storage.js';

export async function writeLocalSeedToStaging(): Promise<void> {
  const config = resolveStagingSeedConfig();
  const localClient = createDatabaseClient(config.localDatabaseUrl);
  const stagingClient = createDatabaseClient(config.stagingDatabaseUrl);
  const localStorage = createStorage(config.localStorage);
  const stagingStorage = createStorage(config.stagingStorage);

  try {
    const snapshots = await readLocalSnapshots(localClient.db);

    // Upload first so a failed object transfer leaves the staging database untouched. If the later DB
    // transaction fails, the extra immutable objects are harmless and can be reused by the next attempt.
    await copySnapshotObjectsToStaging(snapshots, localStorage, stagingStorage);
    await replaceDatabaseWithSeedSnapshot(stagingClient.db, snapshots, {
      clearAllPublicTables: true,
      logPrefix: 'seed:write:staging',
    });
  } finally {
    localStorage.client.destroy();
    stagingStorage.client.destroy();
    await Promise.all([localClient.close(), stagingClient.close()]);
  }
}

async function readLocalSnapshots(
  database: ReturnType<typeof createDatabaseClient>['db'],
): Promise<SnapshotWithRows[]> {
  const snapshots: SnapshotWithRows[] = [];

  for (const tableConfig of snapshotTables) {
    const rows = prepareRowsForSeed(
      tableConfig,
      await readSnapshotTableRows(database, tableConfig, { currentSchema: true }),
    );
    snapshots.push({ config: tableConfig, rows });
    console.info(`[seed:write:staging] Read ${rows.length} local ${tableConfig.tableName} row(s)`);
  }

  return snapshots;
}

async function copySnapshotObjectsToStaging(
  snapshots: readonly SnapshotWithRows[],
  localStorage: SeedStorage,
  stagingStorage: SeedStorage,
): Promise<void> {
  const filesByKey = new Map(
    snapshots.flatMap(({ config, rows }) => collectStorageFiles(config, rows)).map((file) => [file.storageKey, file]),
  );
  let uploaded = 0;

  for (const file of filesByKey.values()) {
    const bytes = await downloadObject(localStorage, file.storageKey);

    if (!bytes) {
      console.warn(`[seed:write:staging] Missing local object ${file.storageKey}, skipping`);
      continue;
    }

    await uploadObject(stagingStorage, file.storageKey, bytes, file.contentType);
    uploaded += 1;
  }

  console.info(`[seed:write:staging] Uploaded ${uploaded} object(s)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await writeLocalSeedToStaging();
}
