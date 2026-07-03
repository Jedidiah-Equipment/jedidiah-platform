import {
  account,
  assemblyOverrides,
  assemblyParts,
  customers,
  jobBayCalendarExceptions,
  jobBayOperatorAssignments,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  parts,
  productAssemblies,
  productBays,
  productRanges,
  productSerialSequences,
  products,
  quoteLineItems,
  quoteSelectedAssemblies,
  quotes,
  supplier,
  user,
  userDepartment,
  workingCalendarOffDays,
} from '@pkg/db';
import type { PgTable } from 'drizzle-orm/pg-core';

export type SnapshotRow = Record<string, unknown>;

// A reference to one object in the doc store (bucket-relative key + its content type), extracted from a
// row's StoredFile-shaped columns.
export type SnapshotStorageFile = { storageKey: string; contentType: string };

export type SnapshotTableConfig = {
  fileName: string;
  table: PgTable;
  tableName: string;
  timestampColumns: readonly string[];
  writableColumns?: readonly string[];
  // Columns present in the local schema but absent from the staging source (e.g. a not-yet-deployed
  // migration); excluded from the staging read so seed:read does not select non-existent columns.
  omitReadColumns?: readonly string[];
  // Column (property name) to order the staging read by, so positional seed defaults are deterministic.
  readOrderColumn?: string;
  // Values merged into each row after reading, keyed by index — used to populate columns omitted above.
  seedRowDefaults?: (row: SnapshotRow, index: number) => SnapshotRow;
  // When true, the writer overwrites each `credential`-provider row's `password` with a hash of the
  // shared local seed password, so every snapshot-seeded user logs in with the same known credential.
  seedCredentialPassword?: boolean;
  // Advances a Postgres sequence to MAX(columnName) after seeding, so app-created rows do not collide
  // with seeded `code` values. Needed for tables whose code column defaults from a pgSequence.
  resetSequence?: { sequenceName: string; columnName: string };
  // Extracts doc-store object references from a row so seed:read can download the bytes from staging and
  // seed:write can upload them to the local store. Only for tables with StoredFile-shaped columns.
  storageFiles?: (row: SnapshotRow) => SnapshotStorageFile[];
};

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

export const snapshotTables = [
  {
    fileName: 'user.json',
    table: user,
    tableName: 'user',
    timestampColumns: authTimestampColumns,
  },
  {
    fileName: 'user_department.json',
    table: userDepartment,
    tableName: 'user_department',
    timestampColumns: [],
  },
  {
    fileName: 'job_bay.json',
    table: jobBays,
    tableName: 'job_bay',
    timestampColumns: ['createdAt', 'disabledAt', 'updatedAt'],
  },
  {
    fileName: 'job_bay_operator_assignment.json',
    table: jobBayOperatorAssignments,
    tableName: 'job_bay_operator_assignment',
    timestampColumns: ['assignedAt', 'unassignedAt'],
  },
  {
    // `date` is a calendar-date string column, so it stays a string rather than a revived Date.
    fileName: 'working_calendar_off_day.json',
    table: workingCalendarOffDays,
    tableName: 'working_calendar_off_day',
    timestampColumns: ['createdAt', 'updatedAt'],
  },
  {
    // `date` is a calendar-date string column, so it stays a string rather than a revived Date.
    fileName: 'job_bay_calendar_exception.json',
    table: jobBayCalendarExceptions,
    tableName: 'job_bay_calendar_exception',
    timestampColumns: ['createdAt', 'updatedAt'],
  },
  {
    // Never dump staging password hashes into the committed snapshot. The reader omits the column and
    // stores null; the writer fills credential accounts with the shared local seed password on insert.
    fileName: 'account.json',
    table: account,
    tableName: 'account',
    timestampColumns: authTimestampColumns,
    omitReadColumns: ['password'],
    seedRowDefaults: () => ({ password: null }),
    seedCredentialPassword: true,
  },
  {
    fileName: 'customers.json',
    table: customers,
    tableName: 'customers',
    timestampColumns: standardTimestampColumns,
  },
  {
    fileName: 'supplier.json',
    table: supplier,
    tableName: 'supplier',
    timestampColumns: standardTimestampColumns,
  },
  {
    fileName: 'parts.json',
    table: parts,
    tableName: 'parts',
    timestampColumns: [],
  },
  {
    fileName: 'product_ranges.json',
    table: productRanges,
    tableName: 'product_ranges',
    timestampColumns: standardTimestampColumns,
    storageFiles: (row) => [row.image, row.logo].map(toStorageFile).filter(isStorageFile),
  },
  {
    fileName: 'products.json',
    table: products,
    tableName: 'products',
    timestampColumns: standardTimestampColumns,
    storageFiles: (row) =>
      Object.values((row.images ?? {}) as Record<string, unknown>)
        .map(toStorageFile)
        .filter(isStorageFile),
  },
  {
    fileName: 'product_bay.json',
    table: productBays,
    tableName: 'product_bay',
    timestampColumns: ['createdAt', 'updatedAt'],
  },
  {
    fileName: 'product_serial_sequence.json',
    table: productSerialSequences,
    tableName: 'product_serial_sequence',
    timestampColumns: ['updatedAt'],
  },
  {
    fileName: 'product_assemblies.json',
    table: productAssemblies,
    tableName: 'product_assemblies',
    timestampColumns: standardTimestampColumns,
  },
  {
    fileName: 'assembly_parts.json',
    table: assemblyParts,
    tableName: 'assembly_parts',
    timestampColumns: [],
  },
  {
    fileName: 'assembly_overrides.json',
    table: assemblyOverrides,
    tableName: 'assembly_overrides',
    timestampColumns: [],
    writableColumns: ['optionalAssemblyId', 'productId', 'standardAssemblyId'],
  },
  {
    // `valid_until`/`preferred_delivery_date`/`planned_delivery_date` are calendar-date string columns,
    // so they stay strings rather than revived Dates.
    fileName: 'quote.json',
    table: quotes,
    tableName: 'quote',
    timestampColumns: ['createdAt', 'statusChangedAt', 'updatedAt'],
    resetSequence: { sequenceName: 'quote_code_seq', columnName: 'code' },
  },
  {
    fileName: 'quote_line_items.json',
    table: quoteLineItems,
    tableName: 'quote_line_items',
    timestampColumns: standardTimestampColumns,
  },
  {
    fileName: 'quote_selected_assemblies.json',
    table: quoteSelectedAssemblies,
    tableName: 'quote_selected_assemblies',
    timestampColumns: standardTimestampColumns,
  },
  {
    fileName: 'job.json',
    table: jobs,
    tableName: 'job',
    timestampColumns: standardTimestampColumns,
    resetSequence: { sequenceName: 'job_code_seq', columnName: 'code' },
  },
  {
    fileName: 'job_cfo_assembly.json',
    table: jobCfoAssemblies,
    tableName: 'job_cfo_assembly',
    timestampColumns: [],
  },
  {
    fileName: 'job_cfo_part.json',
    table: jobCfoParts,
    tableName: 'job_cfo_part',
    timestampColumns: [],
  },
  {
    fileName: 'job_slot.json',
    table: jobSlots,
    tableName: 'job_slot',
    timestampColumns: ['createdAt', 'updatedAt'],
  },
] as const satisfies readonly SnapshotTableConfig[];

export const snapshotTableNames = snapshotTables.map((table) => table.tableName);
export const snapshotCleanupTables = [...snapshotTables].reverse();

// Extracts the doc-store object references for every row of a table, de-duplicated by storage key.
// Returns an empty list for tables without a `storageFiles` extractor.
export function collectStorageFiles(config: SnapshotTableConfig, rows: readonly SnapshotRow[]): SnapshotStorageFile[] {
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

export function projectWritableRow(config: SnapshotTableConfig, row: SnapshotRow): SnapshotRow {
  if (!config.writableColumns) {
    return row;
  }

  return Object.fromEntries(config.writableColumns.map((column) => [column, row[column]]));
}
