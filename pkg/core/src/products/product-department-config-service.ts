import { type DatabaseTransaction, productDepartmentConfigs, stations } from '@pkg/db';
import { DEPARTMENTS, type ProductDepartmentConfig, type UUID } from '@pkg/schema';
import { eq, inArray } from 'drizzle-orm';

import { ProductDepartmentStationMismatchError } from './product-errors.js';

type ProductDepartmentConfigRow = typeof productDepartmentConfigs.$inferSelect;

export function mapProductDepartmentConfigs(rows: ProductDepartmentConfigRow[] = []): ProductDepartmentConfig[] {
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
}): Promise<ProductDepartmentConfigRow[]> {
  await assertStationDepartmentsMatchConfigs({ tx, incomingConfigs });

  await tx.delete(productDepartmentConfigs).where(eq(productDepartmentConfigs.productId, productId));

  const configuredRows = incomingConfigs.filter(
    (config) => config.durationDays > 0 || config.defaultStationIds.length > 0,
  );

  if (configuredRows.length === 0) {
    return [];
  }

  return await tx
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
}

async function assertStationDepartmentsMatchConfigs({
  tx,
  incomingConfigs,
}: {
  tx: DatabaseTransaction;
  incomingConfigs: ProductDepartmentConfig[];
}): Promise<void> {
  const stationDepartments = new Map(
    incomingConfigs.flatMap((config) => config.defaultStationIds.map((stationId) => [stationId, config.department])),
  );

  if (stationDepartments.size === 0) {
    return;
  }

  const stationRows = await tx
    .select({
      department: stations.department,
      id: stations.id,
    })
    .from(stations)
    .where(inArray(stations.id, [...stationDepartments.keys()]));

  const foundStationIds = new Set(stationRows.map((station) => station.id));

  for (const [stationId, expectedDepartment] of stationDepartments) {
    const station = stationRows.find((row) => row.id === stationId);

    if (!foundStationIds.has(stationId) || station?.department !== expectedDepartment) {
      throw new ProductDepartmentStationMismatchError({
        expectedDepartment,
        stationId,
      });
    }
  }
}
