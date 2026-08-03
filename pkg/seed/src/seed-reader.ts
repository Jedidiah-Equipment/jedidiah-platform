import { randomUUID } from 'node:crypto';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import './load-read-env.js';
import { createDatabaseClient, type Db } from '@pkg/db';
import { asc, getTableColumns } from 'drizzle-orm';
import { resolveSeedReadSource, type SeedReadSource } from './seed-read-source.js';
import { serializeSnapshotRows } from './snapshot-json.js';
import { objectFilePath, snapshotDirectory } from './snapshot-paths.js';
import {
  collectStorageFiles,
  prepareSnapshotRow,
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
        const { cached, downloaded } = await downloadSnapshotObjects(
          storage,
          collectStorageFiles(config, rows),
          source.name,
        );
        console.info(`[seed:read] Downloaded ${downloaded} ${config.tableName} object(s) (${cached} already cached)`);
      }
    }
  } finally {
    await client.close();
  }
}

// Reads a table's rows for the snapshot. Optional rollout columns are retried without when the source
// still has the preceding schema; defaults fill that gap without overwriting values once deployed.
async function readSnapshotRows(db: Db, config: SnapshotTableConfig): Promise<SnapshotRow[]> {
  try {
    return await readExistingSnapshotTable(db, config);
  } catch (error) {
    if (config.optionalReadTable && hasPostgresErrorCode(error, '42P01')) {
      return [];
    }

    throw error;
  }
}

export async function readExistingSnapshotTable(db: Db, config: SnapshotTableConfig): Promise<SnapshotRow[]> {
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

  const optionalReadColumns = config.optionalReadColumns ?? [];
  let rows: SnapshotRow[] | undefined;

  // Rollout columns are newest-first. Retry by progressively omitting them so a source that only lacks
  // the newest column still preserves values from older rollout columns instead of defaulting them too.
  for (let omittedCount = 0; omittedCount <= optionalReadColumns.length; omittedCount += 1) {
    try {
      rows = await readRows(optionalReadColumns.slice(0, omittedCount));
      break;
    } catch (error) {
      if (omittedCount === optionalReadColumns.length || !hasPostgresErrorCode(error, '42703')) {
        throw error;
      }
    }
  }

  if (!rows) throw new Error(`Unable to read snapshot rows for ${config.tableName}`);
  return rows.map((row, index) => prepareSnapshotRow(config, row, index));
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
): Promise<{ cached: number; downloaded: number }> {
  let cached = 0;
  let downloaded = 0;

  for (const file of files) {
    const destination = objectFilePath(file.storageKey);
    const result = await downloadSnapshotObjectIfMissing(destination, () => downloadObject(storage, file.storageKey));

    if (result === 'cached') {
      cached += 1;
      continue;
    }

    if (result === 'missing') {
      console.warn(`[seed:read] Missing ${source} object ${file.storageKey}, skipping`);
      continue;
    }

    downloaded += 1;
  }

  return { cached, downloaded };
}

// Snapshot image replacements receive new storage keys, so an existing file is the same immutable object.
export async function downloadSnapshotObjectIfMissing(
  destination: URL,
  download: () => Promise<Uint8Array | null>,
): Promise<'cached' | 'downloaded' | 'missing'> {
  try {
    await access(destination);
    return 'cached';
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const bytes = await download();

  if (!bytes) {
    return 'missing';
  }

  await mkdir(new URL('.', destination), { recursive: true });
  const temporaryDestination = new URL(`.${randomUUID()}.tmp`, new URL('.', destination));

  // Keep the temporary file beside its destination so rename is atomic and interrupted writes never
  // become cache hits on a later seed read.
  try {
    await writeFile(temporaryDestination, bytes);
    await rename(temporaryDestination, destination);
  } finally {
    await rm(temporaryDestination, { force: true });
  }

  return 'downloaded';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await readSeedSnapshot(process.argv[2]);
}
