import { type Db, productUnits } from '@pkg/db';
import type { AuthId, ProductUnitUpdateInput, ProductUnitUpdateResult } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { defineAuditDescriptor, diffAuditUpdate, recordAuditUpdate } from '../audit/audit-service.js';
import { ProductUnitNotFoundError } from './product-unit-errors.js';
import { getProductUnit } from './product-unit-read-service.js';

export type ProductUnitRow = typeof productUnits.$inferSelect;

/**
 * A Unit is audited for the facts that identify the physical machine. The serial is minted once and
 * never edited, but it is recorded so the create event names the machine that came into being; the VIN
 * is the one field a person can change, and it survives every later Job on that machine.
 */
export const productUnitAuditDescriptor = defineAuditDescriptor<ProductUnitRow>({
  entityType: 'product_unit',
  noun: 'product unit',
  primaryLabelField: 'productSerialNumber',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    productId: row.productId,
    productSerialNumber: row.productSerialNumber,
    vinNumber: row.vinNumber,
  }),
});

export async function updateProductUnit({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: ProductUnitUpdateInput;
}): Promise<ProductUnitUpdateResult> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(productUnits).where(eq(productUnits.id, input.id)).for('update');

    if (!before) {
      throw new ProductUnitNotFoundError(input.id);
    }

    const changes = diffAuditUpdate(productUnitAuditDescriptor, before, { ...before, vinNumber: input.vinNumber });

    if (changes) {
      const [after] = await tx
        .update(productUnits)
        .set({ updatedAt: new Date(), vinNumber: input.vinNumber })
        .where(eq(productUnits.id, input.id))
        .returning();

      if (!after) {
        throw new ProductUnitNotFoundError(input.id);
      }

      await recordAuditUpdate({ db: tx, descriptor: productUnitAuditDescriptor, actorUserId, after, changes });
    }

    return { unit: await getProductUnit({ db: tx, id: input.id }) };
  });
}
