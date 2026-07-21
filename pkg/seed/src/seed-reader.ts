import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import './load-read-env.js';
import { createDatabaseClient, type Db } from '@pkg/db';
import { asc, getTableColumns } from 'drizzle-orm';
import { resolveSeedReadSource, type SeedReadSource } from './seed-read-source.js';
import { serializeSnapshotRows } from './snapshot-json.js';
import { objectFilePath, snapshotDirectory } from './snapshot-paths.js';
import {
  applySeedRowDefaults,
  collectStorageFiles,
  type SnapshotRow,
  type SnapshotStorageFile,
  type SnapshotTableConfig,
  snapshotTables,
} from './snapshot-tables.js';
import { createStorageFromEnv, downloadObject, type SeedStorage } from './storage.js';

export async function readSeedSnapshot(sourceArgument?: string): Promise<void> {
  const source = resolveSeedReadSource(sourceArgument);
  const client = createDatabaseClient(source.databaseUrl);
  const storage = createStorageFromEnv(source.storagePrefix);

  try {
    console.info(`[seed:read] Reading ${source.name} snapshot`);
    await mkdir(snapshotDirectory, { recursive: true });

    const configs: readonly SnapshotTableConfig[] = snapshotTables;

    for (const config of configs) {
      const rows = await readSnapshotRows(client.db, config);
      const destination = new URL(config.fileName, snapshotDirectory);

      await writeFile(destination, serializeSnapshotRows(rows));
      console.info(`[seed:read] Wrote ${rows.length} ${config.tableName} row(s) to ${destination.pathname}`);

      if (config.storageFiles) {
        const downloaded = await downloadSnapshotObjects(storage, collectStorageFiles(config, rows), source.name);
        console.info(`[seed:read] Downloaded ${downloaded} ${config.tableName} object(s)`);
      }
    }
  } finally {
    await client.close();
  }
}

// Reads a table's rows for the snapshot. Optional rollout columns are retried without when the source
// still has the preceding schema; defaults fill that gap without overwriting values once deployed.
async function readSnapshotRows(db: Db, config: SnapshotTableConfig): Promise<SnapshotRow[]> {
  if (!config.omitReadColumns && !config.optionalReadColumns && !config.readOrderColumn && !config.seedRowDefaults) {
    return (await db.select().from(config.table)) as SnapshotRow[];
  }

  const columns = getTableColumns(config.table);
  const orderColumn = config.readOrderColumn ? columns[config.readOrderColumn] : undefined;
  const readRows = async (additionalOmissions: readonly string[] = []): Promise<SnapshotRow[]> => {
    const omit = new Set([...(config.omitReadColumns ?? []), ...additionalOmissions]);
    const projection = Object.fromEntries(Object.entries(columns).filter(([name]) => !omit.has(name)));
    const query = db.select(projection).from(config.table);

    return (await (orderColumn ? query.orderBy(asc(orderColumn)) : query)) as SnapshotRow[];
  };

  let rows: SnapshotRow[];

  try {
    rows = await readRows();
  } catch (error) {
    if (!config.optionalReadColumns?.length || !hasPostgresErrorCode(error, '42703')) {
      throw error;
    }

    rows = await readRows(config.optionalReadColumns);
  }

  return config.seedRowDefaults ? rows.map((row, index) => applySeedRowDefaults(config, row, index)) : rows;
}

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  let current = error;

  while (current && typeof current === 'object') {
    if ('code' in current && current.code === code) {
      return true;
    }

    current = 'cause' in current ? current.cause : null;
  }

  return false;
}

// Downloads each referenced object from the source store to disk. Missing keys (dangling references)
// are warned about and skipped so one deleted object cannot abort the whole read.
async function downloadSnapshotObjects(
  storage: SeedStorage,
  files: SnapshotStorageFile[],
  source: SeedReadSource,
): Promise<number> {
  let downloaded = 0;

  for (const file of files) {
    const bytes = await downloadObject(storage, file.storageKey);

    if (!bytes) {
      console.warn(`[seed:read] Missing ${source} object ${file.storageKey}, skipping`);
      continue;
    }

    const destination = objectFilePath(file.storageKey);
    await mkdir(new URL('.', destination), { recursive: true });
    await writeFile(destination, bytes);
    downloaded += 1;
  }

  return downloaded;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await readSeedSnapshot(process.argv[2]);
}
