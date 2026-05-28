import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import './load-db-env.js';
import { createDatabaseClient } from '@pkg/db';
import { serializeSnapshotRows } from './snapshot-json.js';
import { snapshotDirectory } from './snapshot-paths.js';
import { type SnapshotRow, snapshotTables } from './snapshot-tables.js';

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
      const rows = (await client.db.select().from(config.table)) as SnapshotRow[];
      const destination = new URL(config.fileName, snapshotDirectory);

      await writeFile(destination, serializeSnapshotRows(rows));
      console.info(`[seed:read] Wrote ${rows.length} ${config.tableName} row(s) to ${destination.pathname}`);
    }
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await readStagingSeedSnapshot();
}
