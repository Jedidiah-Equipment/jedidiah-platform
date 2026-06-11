import {
  account,
  assemblyOverrides,
  assemblyParts,
  customers,
  jobBays,
  parts,
  productAssemblies,
  products,
  supplier,
  user,
  userDepartment,
} from '@pkg/db';
import type { PgTable } from 'drizzle-orm/pg-core';

export type SnapshotRow = Record<string, unknown>;

export type SnapshotTableConfig = {
  fileName: string;
  table: PgTable;
  tableName: string;
  timestampColumns: readonly string[];
  writableColumns?: readonly string[];
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
    fileName: 'account.json',
    table: account,
    tableName: 'account',
    timestampColumns: authTimestampColumns,
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
    fileName: 'products.json',
    table: products,
    tableName: 'products',
    timestampColumns: standardTimestampColumns,
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
