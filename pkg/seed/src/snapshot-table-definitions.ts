import { CREDENTIAL_ACCOUNT_ISSUER } from '@pkg/db';
import { jobCodeSequence, quoteCodeSequence } from '@pkg/db/equipment';
import { LEGACY_QUOTE_CANCELLATION_REASON } from '@pkg/schema/equipment';
import type { PgSequence, PgTable } from 'drizzle-orm/pg-core';

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
  // Required singleton/reference data when a pre-rollout snapshot has no rows.
  emptySnapshotRows?: readonly SnapshotRow[];
  // Column (property name) to order the source read by, so positional seed defaults are deterministic.
  readOrderColumn?: string;
  // Values merged into each row after reading, keyed by index — used to populate columns omitted above.
  seedRowDefaults?: (row: SnapshotRow, index: number) => SnapshotRow;
  // Normalizes legacy snapshot values after defaults are applied, both when reading and writing.
  seedRowTransform?: (row: SnapshotRow, index: number) => SnapshotRow;
  // When true, the writer overwrites each `credential`-provider row's `password` with a hash of the
  // shared local seed password, so every snapshot-seeded user logs in with the same known credential.
  seedCredentialPassword?: boolean;
  // Advances a Postgres sequence to MAX(columnName) after seeding, so app-created rows do not collide
  // with seeded `code` values. Needed for tables whose code column defaults from a pgSequence.
  resetSequence?: { sequence: PgSequence; columnName: string };
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
// Metre-priced legacy cable/pipe uses a one-metre purchase increment; SEMP keeps its 6 m shop length.
const legacyPartStandardPurchaseLengthsMm: Readonly<Record<string, number>> = {
  'CONS-0036': 1000,
  'LTE-0027': 1000,
  'LTE-0028': 1000,
  'SEMP-0001': 6000,
};

// A small hand-made contracting fleet for checkouts whose snapshot predates the real one. Machines
// carry no driver: the snapshot's users come from production and none of them is a Driver.
const demoFleetStamp = new Date('2026-09-11T08:00:00.000Z');
const demoFleetIds = {
  excavator: '5f1c2d3e-0001-4a00-8000-000000000001',
  tractor: '5f1c2d3e-0001-4a00-8000-000000000002',
  gravelTrailer: '5f1c2d3e-0001-4a00-8000-000000000003',
  disc: '5f1c2d3e-0001-4a00-8000-000000000004',
} as const;
const demoFleetEntry = { createdAt: demoFleetStamp, updatedAt: demoFleetStamp } as const;
const demoFleetUnit = { retiredAt: null, retiredReason: null, ...demoFleetEntry } as const;
const demoFleet = {
  categories: [
    {
      id: demoFleetIds.excavator,
      name: 'Excavator',
      kind: 'machine',
      icon: 'excavator',
      colour: 'yellow',
      ...demoFleetEntry,
    },
    { id: demoFleetIds.tractor, name: 'Tractor', kind: 'machine', icon: 'tractor', colour: 'green', ...demoFleetEntry },
    {
      id: demoFleetIds.gravelTrailer,
      name: 'Gravel Trailer',
      kind: 'implement',
      icon: 'gravel-trailer',
      colour: 'blue',
      ...demoFleetEntry,
    },
    { id: demoFleetIds.disc, name: 'Disc', kind: 'implement', icon: 'disc', colour: 'orange', ...demoFleetEntry },
  ],
  machines: [
    {
      id: '5f1c2d3e-0002-4a00-8000-000000000001',
      code: 'KOL220-1',
      make: 'Kobelco',
      model: '220',
      year: 2019,
      registration: null,
      categoryId: demoFleetIds.excavator,
      currentDriverUserId: null,
      notes: null,
      serviceIntervalHours: 500,
      nextServiceDueHours: 4500,
      ...demoFleetUnit,
    },
    {
      id: '5f1c2d3e-0002-4a00-8000-000000000002',
      code: 'JD140-1',
      make: 'John Deere',
      model: '6140M',
      year: 2021,
      registration: 'CG 39 NM',
      categoryId: demoFleetIds.tractor,
      currentDriverUserId: null,
      notes: null,
      serviceIntervalHours: 250,
      nextServiceDueHours: null,
      ...demoFleetUnit,
    },
    {
      id: '5f1c2d3e-0002-4a00-8000-000000000003',
      code: 'JD140-2',
      make: 'John Deere',
      model: '6140M',
      year: null,
      registration: 'CZ 46 TD',
      categoryId: demoFleetIds.tractor,
      currentDriverUserId: null,
      notes: null,
      serviceIntervalHours: null,
      nextServiceDueHours: null,
      ...demoFleetUnit,
    },
  ],
  implements: [
    {
      id: '5f1c2d3e-0003-4a00-8000-000000000001',
      code: 'BGTA-1',
      categoryId: demoFleetIds.gravelTrailer,
      notes: 'Bell 9M3 Agri',
      ...demoFleetUnit,
    },
    {
      id: '5f1c2d3e-0003-4a00-8000-000000000002',
      code: 'JD670-1',
      categoryId: demoFleetIds.disc,
      notes: 'John Deere 670',
      ...demoFleetUnit,
    },
  ],
} as const satisfies Record<string, readonly SnapshotRow[]>;

export const snapshotTableDefinitions = [
  {
    fileName: 'labor_rate_settings.json',
    tableName: 'labor_rate_settings',
    timestampColumns: [],
    optionalReadTable: true,
    emptySnapshotRows: [{ id: 'labor-rate-card', managementOverheadPercentage: 50, hoursPerWorkingDay: 9 }],
  },
  {
    fileName: 'labor_department_rate.json',
    tableName: 'labor_department_rate',
    timestampColumns: [],
    optionalReadTable: true,
    emptySnapshotRows: [
      { department: 'fabrication', costToCompanyRate: 220, billingRate: 550, consumablesPercentage: 60 },
      { department: 'supply', costToCompanyRate: 200, billingRate: null, consumablesPercentage: 60 },
      { department: 'paint', costToCompanyRate: 65, billingRate: 375, consumablesPercentage: 40 },
      { department: 'assembly', costToCompanyRate: 80, billingRate: 320, consumablesPercentage: 20 },
      { department: 'workshop', costToCompanyRate: null, billingRate: 320, consumablesPercentage: null },
    ],
    // Snapshots captured while the Drizzle property was `id` keep seeding. Delete once every snapshot
    // source has been re-read.
    seedRowTransform: ({ id, ...row }) => ({ ...row, department: row.department ?? id }),
  },

  {
    // These columns may be absent when the selected source lags this checkout; omit them so a
    // phase-zero seed read remains compatible across that deployment boundary.
    fileName: 'user.json',
    tableName: 'user',
    timestampColumns: ['lastActivitySeen', ...authTimestampColumns],
    omitReadColumns: ['assistantEnabled'],
    optionalReadColumns: ['contractingRole'],
    seedRowDefaults: (row) => ({
      assistantEnabled: row.role === 'admin' || row.role === 'super-admin',
      contractingRole: null,
    }),
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
    // `issuer` arrived with better-auth 1.7; a source still on the preceding schema reads without it.
    // Defaulted only for `credential`, the same stance migration 0130 takes: an OAuth row would need
    // `local:oauth:<encoded providerId>`, so leaving it unset fails the insert rather than guessing.
    optionalReadColumns: ['issuer'],
    seedRowDefaults: (row) => ({
      password: null,
      ...(row.providerId === 'credential' ? { issuer: CREDENTIAL_ACCOUNT_ISSUER } : {}),
    }),
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
    optionalReadColumns: ['minimumStock', 'standardPurchaseLengthMm', 'stockTrackingMode', 'storageLocation'],
    seedRowDefaults: () => ({ minimumStock: null, stockTrackingMode: 'perpetual', storageLocation: null }),
    // Owns every legacy normalization: its `== null` test covers both a column the source never read
    // and one it read as empty, so the defaults above stay plain. Delete once the source is migrated.
    seedRowTransform: (row) => {
      const legacyPurchaseLength =
        typeof row.code === 'string' ? legacyPartStandardPurchaseLengthsMm[row.code] : undefined;

      return {
        ...row,
        ...(row.code === 'SEMP-0001' && row.category === '6000' ? { category: 'Pipe' } : {}),
        standardPurchaseLengthMm:
          row.standardPurchaseLengthMm == null ? (legacyPurchaseLength ?? null) : row.standardPurchaseLengthMm,
        unitOfMeasure: row.unitOfMeasure === 'quantity' ? 'piece' : row.unitOfMeasure,
      };
    },
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
    fileName: 'product_material_line.json',
    tableName: 'product_material_line',
    timestampColumns: [],
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
    // Parents-first: Job references its Unit, so Units must land before Jobs and clean up after them.
    fileName: 'product_unit.json',
    tableName: 'product_unit',
    timestampColumns: ['createdAt', 'updatedAt'],
    optionalReadTable: true,
  },
  {
    fileName: 'product_assemblies.json',
    tableName: 'product_assemblies',
    timestampColumns: standardTimestampColumns,
    // Existing Assemblies are backfilled visible; preserve that behavior before and after remote rollout.
    optionalReadColumns: ['isPubliclyVisible'],
    seedRowDefaults: () => ({ isPubliclyVisible: true }),
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
    // so they stay strings rather than revived Dates.
    fileName: 'quote.json',
    tableName: 'quote',
    timestampColumns: ['createdAt', 'statusChangedAt', 'updatedAt'],
    optionalReadColumns: ['deliveryTerms', 'cancellationReason'],
    seedRowDefaults: (row) => ({
      cancellationReason: row.status === 'cancelled' ? LEGACY_QUOTE_CANCELLATION_REASON : null,
      // Before Delivery Terms the price alone told included from charged, so the backfill reads it.
      deliveryTerms: Number(row.deliveryPrice) > 0 ? 'additional_charge' : 'included',
    }),
    resetSequence: { sequence: quoteCodeSequence, columnName: 'code' },
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
    // Captured once the Product Unit migration is deployed; until then the source still has the
    // preceding schema and the read is retried without it.
    optionalReadColumns: ['productUnitId'],
    seedRowDefaults: () => ({ productUnitId: null }),
    resetSequence: { sequence: jobCodeSequence, columnName: 'code' },
  },
  {
    // References Jobs and Users, so cleanup must reach close-outs before either parent.
    fileName: 'job_stock_close_out.json',
    tableName: 'job_stock_close_out',
    timestampColumns: ['createdAt'],
    optionalReadTable: true,
  },
  {
    // References Units, Customers, Quotes, and Users, so it follows every one of them.
    fileName: 'product_unit_ownership_transfer.json',
    tableName: 'product_unit_ownership_transfer',
    timestampColumns: ['createdAt'],
    optionalReadTable: true,
  },
  {
    // References Jobs and Product Assemblies, so it follows both.
    fileName: 'job_build_spec_assembly.json',
    tableName: 'job_build_spec_assembly',
    timestampColumns: [],
    optionalReadTable: true,
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
  {
    // References Users, Quotes, and Jobs, so it follows all of them.
    fileName: 'feedback.json',
    tableName: 'feedback',
    timestampColumns: standardTimestampColumns,
    optionalReadTable: true,
  },
  {
    fileName: 'feedback_department.json',
    tableName: 'feedback_department',
    timestampColumns: [],
    optionalReadTable: true,
  },
  {
    fileName: 'feedback_user.json',
    tableName: 'feedback_user',
    timestampColumns: [],
    optionalReadTable: true,
  },
  // The contracting schema follows every public table it references (Users as Drivers, Mechanics
  // and reading capturers). The snapshot directory is never committed, so until production carries
  // the real fleet (#1394's ingestion) a fresh checkout seeds the demo fleet below; once
  // `seed:read:production` captures real rows, those files win. Only the fleet tables get demo rows:
  // the directory tables and readings start empty, and would otherwise resurface demo rows beside
  // real data whenever production holds none.
  {
    fileName: 'contracting_category.json',
    tableName: 'contracting_category',
    timestampColumns: standardTimestampColumns,
    optionalReadTable: true,
    emptySnapshotRows: demoFleet.categories,
  },
  {
    fileName: 'contracting_machine.json',
    tableName: 'contracting_machine',
    timestampColumns: ['createdAt', 'retiredAt', 'updatedAt'],
    optionalReadTable: true,
    emptySnapshotRows: demoFleet.machines,
  },
  {
    fileName: 'contracting_implement.json',
    tableName: 'contracting_implement',
    timestampColumns: ['createdAt', 'retiredAt', 'updatedAt'],
    optionalReadTable: true,
    emptySnapshotRows: demoFleet.implements,
  },
  {
    fileName: 'contracting_customer.json',
    tableName: 'contracting_customer',
    timestampColumns: standardTimestampColumns,
    optionalReadTable: true,
  },
  {
    fileName: 'contracting_farm.json',
    tableName: 'contracting_farm',
    timestampColumns: [],
    optionalReadTable: true,
  },
  {
    fileName: 'contracting_work_type.json',
    tableName: 'contracting_work_type',
    timestampColumns: [],
    optionalReadTable: true,
  },
  {
    // `sequence` is a generated identity, so the writer must not send it back.
    fileName: 'contracting_hour_reading.json',
    tableName: 'contracting_hour_reading',
    timestampColumns: ['amendedAt', 'capturedAt', 'evidenceReviewedAt'],
    optionalReadTable: true,
    writableColumns: [
      'id',
      'machineId',
      'role',
      'value',
      'capturedAt',
      'capturedByUserId',
      'method',
      'comment',
      'photo',
      'aiValue',
      'aiConfidence',
      'aiVerification',
      'disputed',
      'disputeReason',
      'disputedPreviousId',
      'evidenceReviewedAt',
      'amendedBy',
      'amendedAt',
      'amendmentReason',
    ],
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

export function prepareSnapshotRow(config: SnapshotTableDefinition, row: SnapshotRow, index: number): SnapshotRow {
  const rowWithDefaults = {
    ...(config.seedRowDefaults?.(row, index) ?? {}),
    ...row,
  };

  return config.seedRowTransform?.(rowWithDefaults, index) ?? rowWithDefaults;
}
