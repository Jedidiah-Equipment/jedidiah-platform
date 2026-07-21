import { DEFAULT_CUSTOM_HOURLY_RATE } from '@pkg/domain';
import type { PgTable } from 'drizzle-orm/pg-core';

export type SnapshotRow = Record<string, unknown>;

// A reference to one object in the doc store (bucket-relative key + its content type), extracted from a
// row's StoredFile-shaped columns.
export type SnapshotStorageFile = { storageKey: string; contentType: string };

export type SnapshotTableDefinition = {
  fileName: string;
  tableName: string;
  timestampColumns: readonly string[];
  writableColumns?: readonly string[];
  // Columns present in the local schema but potentially absent from a remote source (e.g. a
  // not-yet-deployed migration); excluded so a read never selects non-existent columns.
  omitReadColumns?: readonly string[];
  // Rollout columns should be captured once deployed, but retried without when the source still has
  // the preceding schema. `seedRowDefaults` supplies their temporary fallback values.
  optionalReadColumns?: readonly string[];
  // A newly introduced table may not exist in the selected source yet. Treat only that expected rollout
  // gap as empty; once deployed, normal snapshot reads and writes preserve its rows.
  optionalReadTable?: boolean;
  // Column (property name) to order the source read by, so positional seed defaults are deterministic.
  readOrderColumn?: string;
  // Values merged into each row after reading, keyed by index — used to populate columns omitted above.
  seedRowDefaults?: (row: SnapshotRow, index: number) => SnapshotRow;
  // When true, the writer overwrites each `credential`-provider row's `password` with a hash of the
  // shared local seed password, so every snapshot-seeded user logs in with the same known credential.
  seedCredentialPassword?: boolean;
  // Advances a Postgres sequence to MAX(columnName) after seeding, so app-created rows do not collide
  // with seeded `code` values. Needed for tables whose code column defaults from a pgSequence.
  resetSequence?: { sequenceName: string; columnName: string };
  // Extracts doc-store object references from a row so seed:read can download the bytes from its selected
  // source and seed:write can upload them to the local store. Only for StoredFile-shaped columns.
  storageFiles?: (row: SnapshotRow) => SnapshotStorageFile[];
};

export type SnapshotTableConfig = SnapshotTableDefinition & { table: PgTable };

// Narrows an unknown value to a StoredFile reference. StoredFile columns are stored as jsonb
// (`{ byteSize, contentType, storageKey, updatedAt }`); we only need the key and content type here.
function toStorageFile(value: unknown): SnapshotStorageFile | null {
  if (value && typeof value === 'object' && 'storageKey' in value && 'contentType' in value) {
    const { storageKey, contentType } = value as { storageKey: unknown; contentType: unknown };

    if (typeof storageKey === 'string' && typeof contentType === 'string') {
      return { storageKey, contentType };
    }
  }

  return null;
}

function isStorageFile(value: SnapshotStorageFile | null): value is SnapshotStorageFile {
  return value !== null;
}

const authTimestampColumns = [
  'accessTokenExpiresAt',
  'banExpires',
  'createdAt',
  'refreshTokenExpiresAt',
  'updatedAt',
] as const;

const standardTimestampColumns = ['createdAt', 'updatedAt'] as const;

export const snapshotTableDefinitions = [
  {
    // `assistantEnabled` may be absent when the selected source lags this checkout; omit it and derive it
    // from role so seed:read remains compatible across that deployment boundary.
    fileName: 'user.json',
    tableName: 'user',
    timestampColumns: authTimestampColumns,
    omitReadColumns: ['assistantEnabled'],
    seedRowDefaults: (row) => ({ assistantEnabled: row.role === 'admin' || row.role === 'super-admin' }),
  },
  {
    fileName: 'user_department.json',
    tableName: 'user_department',
    timestampColumns: [],
  },
  {
    fileName: 'job_bay.json',
    tableName: 'job_bay',
    timestampColumns: ['createdAt', 'disabledAt', 'updatedAt'],
  },
  {
    fileName: 'job_bay_operator_assignment.json',
    tableName: 'job_bay_operator_assignment',
    timestampColumns: ['assignedAt', 'unassignedAt'],
  },
  {
    // `date` is a calendar-date string column, so it stays a string rather than a revived Date.
    fileName: 'working_calendar_off_day.json',
    tableName: 'working_calendar_off_day',
    timestampColumns: ['createdAt', 'updatedAt'],
  },
  {
    // `date` is a calendar-date string column, so it stays a string rather than a revived Date.
    fileName: 'job_bay_calendar_exception.json',
    tableName: 'job_bay_calendar_exception',
    timestampColumns: ['createdAt', 'updatedAt'],
  },
  {
    // Never dump remote password hashes into the local snapshot. The reader omits the column and
    // stores null; the writer fills credential accounts with the shared local seed password on insert.
    fileName: 'account.json',
    tableName: 'account',
    timestampColumns: authTimestampColumns,
    omitReadColumns: ['password'],
    seedRowDefaults: () => ({ password: null }),
    seedCredentialPassword: true,
  },
  {
    fileName: 'customers.json',
    tableName: 'customers',
    timestampColumns: standardTimestampColumns,
  },
  {
    fileName: 'supplier.json',
    tableName: 'supplier',
    timestampColumns: ['createdAt', 'updatedAt', 'deletedAt'],
  },
  {
    fileName: 'parts.json',
    tableName: 'parts',
    timestampColumns: [],
  },
  {
    fileName: 'product_ranges.json',
    tableName: 'product_ranges',
    timestampColumns: ['createdAt', 'updatedAt', 'deletedAt'],
    storageFiles: (row) => [row.image, row.logo].map(toStorageFile).filter(isStorageFile),
  },
  {
    fileName: 'product_range_variants.json',
    tableName: 'product_range_variants',
    timestampColumns: ['createdAt', 'updatedAt', 'deletedAt'],
  },
  {
    fileName: 'products.json',
    tableName: 'products',
    timestampColumns: ['createdAt', 'updatedAt', 'deletedAt'],
    storageFiles: (row) =>
      Object.values((row.images ?? {}) as Record<string, unknown>)
        .map(toStorageFile)
        .filter(isStorageFile),
  },
  {
    fileName: 'product_bay.json',
    tableName: 'product_bay',
    timestampColumns: ['createdAt', 'updatedAt'],
  },
  {
    fileName: 'product_serial_sequence.json',
    tableName: 'product_serial_sequence',
    timestampColumns: ['updatedAt'],
  },
  {
    fileName: 'product_assemblies.json',
    tableName: 'product_assemblies',
    timestampColumns: standardTimestampColumns,
  },
  {
    fileName: 'assembly_parts.json',
    tableName: 'assembly_parts',
    timestampColumns: [],
  },
  {
    fileName: 'assembly_overrides.json',
    tableName: 'assembly_overrides',
    timestampColumns: [],
    writableColumns: ['optionalAssemblyId', 'productId', 'standardAssemblyId'],
  },
  {
    // `valid_until`/`preferred_delivery_date`/`planned_delivery_date` are calendar-date string columns,
    // so they stay strings rather than revived Dates. The fallback keeps committed snapshots from
    // before hourly rates seedable; a captured per-Quote value still wins in the writer merge.
    fileName: 'quote.json',
    tableName: 'quote',
    timestampColumns: ['createdAt', 'statusChangedAt', 'updatedAt'],
    optionalReadColumns: ['hourlyRate'],
    seedRowDefaults: (row) => ({ hourlyRate: row.kind === 'custom' ? DEFAULT_CUSTOM_HOURLY_RATE : null }),
    resetSequence: { sequenceName: 'quote_code_seq', columnName: 'code' },
  },
  {
    fileName: 'quote_work_items.json',
    tableName: 'quote_work_items',
    timestampColumns: standardTimestampColumns,
    optionalReadTable: true,
  },
  {
    fileName: 'quote_work_item_parts.json',
    tableName: 'quote_work_item_parts',
    timestampColumns: standardTimestampColumns,
    optionalReadTable: true,
  },
  {
    fileName: 'quote_selected_assemblies.json',
    tableName: 'quote_selected_assemblies',
    timestampColumns: standardTimestampColumns,
  },
  {
    fileName: 'job.json',
    tableName: 'job',
    timestampColumns: ['cancelledAt', ...standardTimestampColumns],
    resetSequence: { sequenceName: 'job_code_seq', columnName: 'code' },
  },
  {
    fileName: 'job_cfo_assembly.json',
    tableName: 'job_cfo_assembly',
    timestampColumns: [],
  },
  {
    fileName: 'job_cfo_part.json',
    tableName: 'job_cfo_part',
    timestampColumns: [],
  },
  {
    fileName: 'job_slot.json',
    tableName: 'job_slot',
    timestampColumns: ['createdAt', 'updatedAt'],
  },
] as const satisfies readonly SnapshotTableDefinition[];

// Extracts the doc-store object references for every row of a table, de-duplicated by storage key.
// Returns an empty list for tables without a `storageFiles` extractor.
export function collectStorageFiles(
  config: SnapshotTableDefinition,
  rows: readonly SnapshotRow[],
): SnapshotStorageFile[] {
  const extract = config.storageFiles;

  if (!extract) {
    return [];
  }

  const byKey = new Map<string, SnapshotStorageFile>();

  for (const row of rows) {
    for (const file of extract(row)) {
      byKey.set(file.storageKey, file);
    }
  }

  return [...byKey.values()];
}

export function projectWritableRow(config: SnapshotTableDefinition, row: SnapshotRow): SnapshotRow {
  if (!config.writableColumns) {
    return row;
  }

  return Object.fromEntries(config.writableColumns.map((column) => [column, row[column]]));
}

export function applySeedRowDefaults(config: SnapshotTableDefinition, row: SnapshotRow, index: number): SnapshotRow {
  return {
    ...(config.seedRowDefaults?.(row, index) ?? {}),
    ...row,
  };
}
