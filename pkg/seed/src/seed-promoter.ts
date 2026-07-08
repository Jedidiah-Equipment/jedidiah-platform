import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import './load-write-env.js';
import { createDatabaseClient, type DatabaseTransaction, getDatabaseUrl, sql } from '@pkg/db';
import { hashPassword } from 'better-auth/crypto';
import { deserializeSnapshotRows } from './snapshot-json.js';
import { objectFilePath, snapshotDirectory } from './snapshot-paths.js';
import {
  collectStorageFiles,
  projectWritableRow,
  type SnapshotRow,
  type SnapshotStorageFile,
  type SnapshotTableConfig,
  snapshotTables,
} from './snapshot-tables.js';
import { createStorageFromEnv, type SeedStorage, uploadObject } from './storage.js';

export type SnapshotWithRows = { config: SnapshotTableConfig; rows: SnapshotRow[] };

const insertBatchSize = 500;
const productionImportConfirmation = 'production';
const sueSmithDemoUser = { id: 'seed-sue-user', email: 'sales@jedidiahequipment.co.za' } as const;

const quoteJobClusterTableNames = new Set([
  'quote',
  'quote_line_items',
  'quote_selected_assemblies',
  'job',
  'job_cfo_assembly',
  'job_cfo_part',
  'job_slot',
]);

function rowId(row: SnapshotRow): string | null {
  return typeof row.id === 'string' ? row.id : null;
}

function stringValue(row: SnapshotRow, key: string): string | null {
  const value = row[key];

  return typeof value === 'string' ? value : null;
}

function isActive(row: SnapshotRow): boolean {
  return row.deletedAt === null || row.deletedAt === undefined;
}

function hasId(ids: ReadonlySet<string>, id: unknown): boolean {
  return typeof id === 'string' && ids.has(id);
}

function isSueSmithDemoUser(row: SnapshotRow): boolean {
  return rowId(row) === sueSmithDemoUser.id || stringValue(row, 'email') === sueSmithDemoUser.email;
}

function rowsFor(snapshots: ReadonlyMap<string, SnapshotWithRows>, tableName: string): SnapshotRow[] {
  return snapshots.get(tableName)?.rows ?? [];
}

function idsFrom(rows: readonly SnapshotRow[]): Set<string> {
  return new Set(rows.map(rowId).filter((id): id is string => id !== null));
}

function buildRetainedRows(snapshots: readonly SnapshotWithRows[]): Map<string, SnapshotRow[]> {
  const source = new Map(snapshots.map((snapshot) => [snapshot.config.tableName, snapshot]));
  const retained = new Map<string, SnapshotRow[]>();

  const users = rowsFor(source, 'user').filter((row) => !isSueSmithDemoUser(row));
  const userIds = idsFrom(users);
  retained.set('user', users);
  retained.set(
    'user_department',
    rowsFor(source, 'user_department').filter((row) => hasId(userIds, row.userId)),
  );
  retained.set(
    'account',
    rowsFor(source, 'account').filter((row) => hasId(userIds, row.userId)),
  );

  retained.set('job_bay', rowsFor(source, 'job_bay'));
  retained.set(
    'job_bay_operator_assignment',
    rowsFor(source, 'job_bay_operator_assignment').filter((row) => hasId(userIds, row.operatorUserId)),
  );
  retained.set('working_calendar_off_day', rowsFor(source, 'working_calendar_off_day'));
  retained.set('job_bay_calendar_exception', rowsFor(source, 'job_bay_calendar_exception'));
  retained.set('customers', rowsFor(source, 'customers'));

  const suppliers = rowsFor(source, 'supplier').filter(isActive);
  const supplierIds = idsFrom(suppliers);
  retained.set('supplier', suppliers);

  const parts = rowsFor(source, 'parts').filter((row) => hasId(supplierIds, row.supplierId));
  const partIds = idsFrom(parts);
  retained.set('parts', parts);

  const ranges = rowsFor(source, 'product_ranges').filter(isActive);
  const rangeIds = idsFrom(ranges);
  retained.set('product_ranges', ranges);

  const variants = rowsFor(source, 'product_range_variants').filter(
    (row) => isActive(row) && hasId(rangeIds, row.rangeId),
  );
  const variantIds = idsFrom(variants);
  retained.set('product_range_variants', variants);

  const products = rowsFor(source, 'products').filter(
    (row) =>
      isActive(row) &&
      hasId(rangeIds, row.rangeId) &&
      (row.variantId === null || row.variantId === undefined || hasId(variantIds, row.variantId)),
  );
  const productIds = idsFrom(products);
  retained.set('products', products);

  retained.set(
    'product_bay',
    rowsFor(source, 'product_bay').filter((row) => hasId(productIds, row.productId)),
  );
  retained.set(
    'product_serial_sequence',
    rowsFor(source, 'product_serial_sequence').filter((row) => hasId(productIds, row.productId)),
  );

  const assemblies = rowsFor(source, 'product_assemblies').filter((row) => hasId(productIds, row.productId));
  const assemblyIds = idsFrom(assemblies);
  retained.set('product_assemblies', assemblies);
  retained.set(
    'assembly_parts',
    rowsFor(source, 'assembly_parts').filter((row) => hasId(assemblyIds, row.assemblyId) && hasId(partIds, row.partId)),
  );
  retained.set(
    'assembly_overrides',
    rowsFor(source, 'assembly_overrides').filter(
      (row) =>
        hasId(productIds, row.productId) &&
        hasId(assemblyIds, row.optionalAssemblyId) &&
        hasId(assemblyIds, row.standardAssemblyId),
    ),
  );

  for (const tableName of quoteJobClusterTableNames) {
    retained.set(tableName, []);
  }

  return retained;
}

export function filterProductionSnapshots(snapshots: readonly SnapshotWithRows[]): SnapshotWithRows[] {
  const retainedRows = buildRetainedRows(snapshots);

  return snapshots.map(({ config }) => ({
    config,
    rows: (retainedRows.get(config.tableName) ?? []).map((row) => projectWritableRow(config, row)),
  }));
}

export function assertProductionImportIsAllowed(
  env: NodeJS.ProcessEnv = process.env,
  targetDatabaseUrl = getDatabaseUrl(env),
): void {
  if (env.APP_ENV !== 'production') {
    throw new Error('Production seed import requires APP_ENV=production.');
  }

  if (env.CONFIRM_PRODUCTION_IMPORT !== productionImportConfirmation) {
    throw new Error(`Production seed import requires CONFIRM_PRODUCTION_IMPORT=${productionImportConfirmation}.`);
  }

  assertTargetDatabaseIsNotBlocked(targetDatabaseUrl, env);
}

function assertTargetDatabaseIsNotBlocked(targetDatabaseUrl: string, env: NodeJS.ProcessEnv): void {
  const target = normalizeDatabaseUrl(targetDatabaseUrl);

  for (const [name, value] of [
    ['STAGING_DATABASE_URL', env.STAGING_DATABASE_URL],
    ['TEST_DATABASE_URL', env.TEST_DATABASE_URL],
  ] as const) {
    if (value && target === normalizeDatabaseUrl(value)) {
      throw new Error(`Refusing production seed import because DATABASE_URL matches ${name}.`);
    }
  }

  const parsed = new URL(targetDatabaseUrl);
  const host = parsed.hostname.toLowerCase();
  const databaseName = parsed.pathname.replace(/^\//, '').toLowerCase();

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    throw new Error('Refusing production seed import into a local database host.');
  }

  if (databaseName.includes('template')) {
    throw new Error('Refusing production seed import into a template database.');
  }
}

function normalizeDatabaseUrl(databaseUrl: string): string {
  return new URL(databaseUrl).href;
}

async function readSnapshotFile(config: SnapshotTableConfig): Promise<SnapshotRow[]> {
  const snapshotFile = new URL(config.fileName, snapshotDirectory);

  return deserializeSnapshotRows(config, await readFile(snapshotFile, 'utf8'));
}

async function readPromotionSnapshots(): Promise<SnapshotWithRows[]> {
  return Promise.all(
    snapshotTables.map(async (config) => ({
      config,
      rows: await readSnapshotFile(config),
    })),
  );
}

export async function withProductionCredentialPasswords(
  snapshots: readonly SnapshotWithRows[],
): Promise<SnapshotWithRows[]> {
  return Promise.all(
    snapshots.map(async ({ config, rows }) => {
      if (!config.seedCredentialPassword) {
        return { config, rows };
      }

      return {
        config,
        rows: await Promise.all(
          rows.map(async (row) =>
            row.providerId === 'credential'
              ? { ...row, password: await hashPassword(randomBytes(32).toString('base64url')) }
              : row,
          ),
        ),
      };
    }),
  );
}

async function assertTargetTablesAreEmpty(db: DatabaseTransaction): Promise<void> {
  for (const config of snapshotTables) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(config.table);

    if ((row?.count ?? 0) > 0) {
      throw new Error(`Refusing production seed import because target table ${config.tableName} is not empty.`);
    }
  }
}

export async function assertSnapshotObjectFilesExist(snapshots: readonly SnapshotWithRows[]): Promise<void> {
  for (const file of collectPromotedStorageFiles(snapshots)) {
    await readRequiredObjectFile(file.storageKey);
  }
}

export function collectPromotedStorageFiles(snapshots: readonly SnapshotWithRows[]): SnapshotStorageFile[] {
  const filesByKey = new Map<string, SnapshotStorageFile>();

  for (const { config, rows } of snapshots) {
    for (const file of collectStorageFiles(config, rows)) {
      filesByKey.set(file.storageKey, file);
    }
  }

  return [...filesByKey.values()];
}

async function uploadSnapshotObjects(snapshots: readonly SnapshotWithRows[]): Promise<void> {
  const storage: SeedStorage = createStorageFromEnv('');

  for (const { config, rows } of snapshots) {
    if (!config.storageFiles) {
      continue;
    }

    let uploaded = 0;

    for (const file of collectStorageFiles(config, rows)) {
      const bytes = await readRequiredObjectFile(file.storageKey);
      await uploadObject(storage, file.storageKey, bytes, file.contentType);
      uploaded += 1;
    }

    console.info(`[seed:promote] Uploaded ${uploaded} ${config.tableName} object(s)`);
  }
}

async function readRequiredObjectFile(storageKey: string): Promise<Uint8Array> {
  try {
    return await readFile(objectFilePath(storageKey));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Missing local object file ${storageKey}; run seed:read before seed:promote.`);
    }

    throw error;
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

async function resetSnapshotSequence(tx: DatabaseTransaction, config: SnapshotTableConfig): Promise<void> {
  if (!config.resetSequence) {
    return;
  }

  const { sequenceName, columnName } = config.resetSequence;

  await tx.execute(
    sql`SELECT setval(${sequenceName}, COALESCE((SELECT MAX(${sql.identifier(columnName)}) FROM ${config.table}), 1), (SELECT COUNT(*) FROM ${config.table}) > 0)`,
  );
}

export async function promoteSeedSnapshot(): Promise<void> {
  const targetDatabaseUrl = getDatabaseUrl();
  assertProductionImportIsAllowed(process.env, targetDatabaseUrl);

  const snapshots = await withProductionCredentialPasswords(filterProductionSnapshots(await readPromotionSnapshots()));
  await assertSnapshotObjectFilesExist(snapshots);

  const client = createDatabaseClient(targetDatabaseUrl);

  try {
    await client.db.transaction(async (tx) => {
      await assertTargetTablesAreEmpty(tx);

      for (const { config, rows } of snapshots) {
        await insertSnapshotRows(tx, config, rows);
        await resetSnapshotSequence(tx, config);
        console.info(`[seed:promote] Imported ${rows.length} ${config.tableName} row(s)`);
      }
    });

    await uploadSnapshotObjects(snapshots);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await promoteSeedSnapshot();
}
