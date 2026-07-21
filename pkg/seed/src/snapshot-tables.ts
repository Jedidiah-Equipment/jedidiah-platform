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
  productRangeVariants,
  productSerialSequences,
  products,
  quoteSelectedAssemblies,
  quotes,
  supplier,
  user,
  userDepartment,
  workingCalendarOffDays,
} from '@pkg/db';
import type { PgTable } from 'drizzle-orm/pg-core';
import { type SnapshotTableConfig, snapshotTableDefinitions } from './snapshot-table-definitions.js';

export {
  collectStorageFiles,
  projectWritableRow,
  type SnapshotRow,
  type SnapshotStorageFile,
  type SnapshotTableConfig,
  type SnapshotTableDefinition,
} from './snapshot-table-definitions.js';

const dbTablesByName = {
  account,
  assembly_overrides: assemblyOverrides,
  assembly_parts: assemblyParts,
  customers,
  job: jobs,
  job_bay: jobBays,
  job_bay_calendar_exception: jobBayCalendarExceptions,
  job_bay_operator_assignment: jobBayOperatorAssignments,
  job_cfo_assembly: jobCfoAssemblies,
  job_cfo_part: jobCfoParts,
  job_slot: jobSlots,
  parts,
  product_assemblies: productAssemblies,
  product_bay: productBays,
  product_range_variants: productRangeVariants,
  product_ranges: productRanges,
  product_serial_sequence: productSerialSequences,
  products,
  quote: quotes,
  quote_selected_assemblies: quoteSelectedAssemblies,
  supplier,
  user,
  user_department: userDepartment,
  working_calendar_off_day: workingCalendarOffDays,
} satisfies Record<(typeof snapshotTableDefinitions)[number]['tableName'], PgTable>;

export const snapshotTables: readonly SnapshotTableConfig[] = snapshotTableDefinitions.map((config) => ({
  ...config,
  table: dbTablesByName[config.tableName],
}));

export const snapshotTableNames = snapshotTables.map((table) => table.tableName);
export const snapshotCleanupTables: readonly SnapshotTableConfig[] = [...snapshotTables].reverse();
