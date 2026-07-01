import {
  account,
  assemblyOverrides,
  assemblyParts,
  customers,
  jobBayOperatorAssignments,
  jobBays,
  parts,
  productAssemblies,
  productBays,
  productRanges,
  productSerialSequences,
  products,
  supplier,
  user,
  userDepartment,
  workingCalendarOffDays,
} from '@pkg/db';
import type { PgTable } from 'drizzle-orm/pg-core';

export type SnapshotRow = Record<string, unknown>;

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
};

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
  },
  {
    fileName: 'products.json',
    table: products,
    tableName: 'products',
    timestampColumns: standardTimestampColumns,
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
] as const satisfies readonly SnapshotTableConfig[];

export const snapshotTableNames = snapshotTables.map((table) => table.tableName);
export const snapshotCleanupTables = [...snapshotTables].reverse();

export function projectWritableRow(config: SnapshotTableConfig, row: SnapshotRow): SnapshotRow {
  if (!config.writableColumns) {
    return row;
  }

  return Object.fromEntries(config.writableColumns.map((column) => [column, row[column]]));
}
