import { type DatabaseTransaction, productDepartmentConfigs, stations } from '@pkg/db';
import { DEPARTMENTS, type ProductDepartmentConfig, type UUID } from '@pkg/schema';
import { eq, inArray } from 'drizzle-orm';

import { ProductDepartmentStationMismatchError } from './product-errors.js';

type ProductDepartmentConfigRow = typeof productDepartmentConfigs.$inferSelect;

export type SyncProductDepartmentConfigsResult = {
  changes: { before: ProductDepartmentConfig[]; after: ProductDepartmentConfig[] } | null;
  rows: ProductDepartmentConfigRow[];
};

export function mapProductDepartmentConfigs(rows: ProductDepartmentConfigRow[]): ProductDepartmentConfig[] {
  const configsByDepartment = new Map(rows.map((row) => [row.department, row]));

  return DEPARTMENTS.map((department) => {
    const row = configsByDepartment.get(department);

    return {
      defaultStationIds: row?.defaultStationIds ?? [],
      department,
      durationDays: row?.durationDays ?? 0,
    };
  });
}

export async function syncProductDepartmentConfigs({
  tx,
  productId,
  incomingConfigs,
}: {
  tx: DatabaseTransaction;
  productId: UUID;
  incomingConfigs: ProductDepartmentConfig[];
}): Promise<SyncProductDepartmentConfigsResult> {
  await assertStationDepartmentsMatchConfigs({ tx, incomingConfigs });

  const existingRows = await tx
    .select()
    .from(productDepartmentConfigs)
    .where(eq(productDepartmentConfigs.productId, productId))
    .for('update');
  const beforeConfigs = mapProductDepartmentConfigs(existingRows);
  const afterConfigs = mapProductDepartmentConfigs(
    incomingConfigs.map((config) => ({
      createdAt: new Date(0),
      defaultStationIds: config.defaultStationIds,
      department: config.department,
      durationDays: config.durationDays,
      id: '',
      productId,
      updatedAt: new Date(0),
    })),
  );

  if (areProductDepartmentConfigsEqual(beforeConfigs, afterConfigs)) {
    return {
      changes: null,
      rows: existingRows,
    };
  }

  await tx.delete(productDepartmentConfigs).where(eq(productDepartmentConfigs.productId, productId));

  const configuredRows = afterConfigs.filter(
    (config) => config.durationDays > 0 || config.defaultStationIds.length > 0,
  );

  if (configuredRows.length === 0) {
    return {
      changes: { before: beforeConfigs, after: afterConfigs },
      rows: [],
    };
  }

  const rows = await tx
    .insert(productDepartmentConfigs)
    .values(
      configuredRows.map((config) => ({
        defaultStationIds: config.defaultStationIds,
        department: config.department,
        durationDays: config.durationDays,
        productId,
      })),
    )
    .returning();

  return {
    changes: { before: beforeConfigs, after: afterConfigs },
    rows,
  };
}

async function assertStationDepartmentsMatchConfigs({
  tx,
  incomingConfigs,
}: {
  tx: DatabaseTransaction;
  incomingConfigs: ProductDepartmentConfig[];
}): Promise<void> {
  const stationDepartments = incomingConfigs.flatMap((config) =>
    config.defaultStationIds.map((stationId) => ({
      expectedDepartment: config.department,
      stationId,
    })),
  );

  if (stationDepartments.length === 0) {
    return;
  }

  const stationIds = [...new Set(stationDepartments.map((stationDepartment) => stationDepartment.stationId))];
  const stationRows = await tx
    .select({
      department: stations.department,
      id: stations.id,
    })
    .from(stations)
    .where(inArray(stations.id, stationIds));

  const stationsById = new Map(stationRows.map((station) => [station.id, station]));

  for (const { expectedDepartment, stationId } of stationDepartments) {
    const station = stationsById.get(stationId);

    if (!station || station.department !== expectedDepartment) {
      throw new ProductDepartmentStationMismatchError({
        expectedDepartment,
        stationId,
      });
    }
  }
}

function areProductDepartmentConfigsEqual(
  left: readonly ProductDepartmentConfig[],
  right: readonly ProductDepartmentConfig[],
): boolean {
  // Both sides are canonicalized through mapProductDepartmentConfigs: fixed Department order,
  // DTO fields only, and no row metadata. Keep that invariant if this comparison grows.
  return JSON.stringify(left) === JSON.stringify(right);
}
