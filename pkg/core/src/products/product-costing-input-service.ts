import { type DatabaseTransaction, type Db, parts, productLaborHours, productMaterialLines } from '@pkg/db';
import { WORK_ITEM_DEPARTMENTS } from '@pkg/domain';
import type { ProductLaborHour, ProductMaterialLine, UUID } from '@pkg/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { ProductMaterialPartInvalidError } from './product-errors.js';

export type ProductCostingInputs = {
  laborHours: ProductLaborHour[];
  materialLines: ProductMaterialLine[];
};

export async function listProductCostingInputs({
  db,
  productId,
}: {
  db: Db | DatabaseTransaction;
  productId: UUID;
}): Promise<ProductCostingInputs> {
  const [materialLines, laborRows] = await Promise.all([
    db
      .select({ partId: productMaterialLines.partId, quantityPerUnit: productMaterialLines.quantityPerUnit })
      .from(productMaterialLines)
      .where(eq(productMaterialLines.productId, productId))
      .orderBy(asc(productMaterialLines.partId)),
    db
      .select({ department: productLaborHours.department, hours: productLaborHours.hours })
      .from(productLaborHours)
      .where(eq(productLaborHours.productId, productId)),
  ]);
  const departmentOrder = new Map(WORK_ITEM_DEPARTMENTS.map((department, index) => [department, index]));

  return {
    laborHours: laborRows.toSorted(
      (left, right) => (departmentOrder.get(left.department) ?? 0) - (departmentOrder.get(right.department) ?? 0),
    ),
    materialLines,
  };
}

export async function syncProductCostingInputs({
  desired,
  productId,
  tx,
}: {
  desired: ProductCostingInputs;
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<ProductCostingInputs> {
  await assertPeriodicMaterialParts({ materialLines: desired.materialLines, tx });

  await Promise.all([
    tx.delete(productMaterialLines).where(eq(productMaterialLines.productId, productId)),
    tx.delete(productLaborHours).where(eq(productLaborHours.productId, productId)),
  ]);

  if (desired.materialLines.length > 0) {
    await tx.insert(productMaterialLines).values(
      desired.materialLines.map((line) => ({
        partId: line.partId,
        productId,
        quantityPerUnit: line.quantityPerUnit,
      })),
    );
  }

  if (desired.laborHours.length > 0) {
    await tx
      .insert(productLaborHours)
      .values(desired.laborHours.map((line) => ({ department: line.department, hours: line.hours, productId })));
  }

  return listProductCostingInputs({ db: tx, productId });
}

async function assertPeriodicMaterialParts({
  materialLines,
  tx,
}: {
  materialLines: ProductMaterialLine[];
  tx: DatabaseTransaction;
}): Promise<void> {
  if (materialLines.length === 0) return;

  const partIds = materialLines.map((line) => line.partId);
  const rows = await tx
    .select({ id: parts.id, stockTrackingMode: parts.stockTrackingMode })
    .from(parts)
    .where(inArray(parts.id, partIds));
  const periodicPartIds = new Set(rows.filter((row) => row.stockTrackingMode === 'periodic').map((row) => row.id));
  const invalidPartId = partIds.find((partId) => !periodicPartIds.has(partId));

  if (invalidPartId) throw new ProductMaterialPartInvalidError(invalidPartId);
}
