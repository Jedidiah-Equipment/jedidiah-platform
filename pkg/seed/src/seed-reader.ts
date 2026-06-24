import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import './load-db-env.js';
import { createDatabaseClient, type Db } from '@pkg/db';
import { asc, getTableColumns } from 'drizzle-orm';
import { serializeSnapshotRows } from './snapshot-json.js';
import { snapshotDirectory } from './snapshot-paths.js';
import { type SnapshotRow, type SnapshotTableConfig, snapshotTables } from './snapshot-tables.js';

function getStagingDatabaseUrl(): string {
  const stagingDatabaseUrl = process.env.STAGING_DATABASE_URL;

  if (!stagingDatabaseUrl) {
    throw new Error('STAGING_DATABASE_URL is required to read the staging seed snapshot.');
  }

  return stagingDatabaseUrl;
}

export async function readStagingSeedSnapshot(): Promise<void> {
  const client = createDatabaseClient(getStagingDatabaseUrl());

  try {
    await mkdir(snapshotDirectory, { recursive: true });

    for (const config of snapshotTables) {
      const rows = await readSnapshotRows(client.db, config);
      const destination = new URL(config.fileName, snapshotDirectory);

      await writeFile(destination, serializeSnapshotRows(rows));
      console.info(`[seed:read] Wrote ${rows.length} ${config.tableName} row(s) to ${destination.pathname}`);
    }
  } finally {
    await client.close();
  }
}

// Reads a table's rows for the snapshot. The common case selects every column; tables that declare
// omitReadColumns/readOrderColumn/seedRowDefaults select a column subset (skipping columns the staging
// source lacks), order deterministically, and merge in seed defaults for the omitted columns.
async function readSnapshotRows(db: Db, config: SnapshotTableConfig): Promise<SnapshotRow[]> {
  if (!config.omitReadColumns && !config.readOrderColumn && !config.seedRowDefaults) {
    return (await db.select().from(config.table)) as SnapshotRow[];
  }

  const columns = getTableColumns(config.table);
  const omit = new Set(config.omitReadColumns ?? []);
  const projection = Object.fromEntries(Object.entries(columns).filter(([name]) => !omit.has(name)));
  const orderColumn = config.readOrderColumn ? columns[config.readOrderColumn] : undefined;
  const query = db.select(projection).from(config.table);
  const rows = (await (orderColumn ? query.orderBy(asc(orderColumn)) : query)) as SnapshotRow[];

  const applyDefaults = config.seedRowDefaults;

  return applyDefaults ? rows.map((row, index) => ({ ...row, ...applyDefaults(row, index) })) : rows;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await readStagingSeedSnapshot();
}
