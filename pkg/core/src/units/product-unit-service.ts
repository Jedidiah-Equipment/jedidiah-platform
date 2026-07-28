import { customers, type Db, productUnitOwnershipTransfers, productUnits } from '@pkg/db';
import { getPlantDateNow, resolveNewestOwnershipTransfer } from '@pkg/domain';
import type {
  AuthId,
  ProductUnitTransferInput,
  ProductUnitTransferResult,
  ProductUnitUpdateInput,
  ProductUnitUpdateResult,
} from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { defineAuditDescriptor, diffAuditUpdate, recordAuditEvent, recordAuditUpdate } from '../audit/audit-service.js';
import { CustomerNotFoundError } from '../customers/customer-errors.js';
import {
  ProductUnitNotFoundError,
  ProductUnitOwnerUnchangedError,
  ProductUnitTransferBackdatedError,
  ProductUnitTransferInFutureError,
} from './product-unit-errors.js';
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

/**
 * Records a move we had nothing to do with: a Customer selling the machine on, or handing it back. The
 * origin is never supplied — it is the Unit's current Owner at the moment the row is written, read
 * under the Unit's row lock so two concurrent transfers cannot both claim the same origin.
 *
 * Nothing commercial is attached: no Quote, no price, no salesperson, so none of this reaches sales
 * reporting. The append-only row remains the ownership source of truth; the Product Unit audit event
 * makes this boundary-visible change discoverable in the workspace-wide audit feed.
 */
export async function transferProductUnitOwnership({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: ProductUnitTransferInput;
}): Promise<ProductUnitTransferResult> {
  return db.transaction(async (tx) => {
    const [unit] = await tx
      .select({ id: productUnits.id, productSerialNumber: productUnits.productSerialNumber })
      .from(productUnits)
      .where(eq(productUnits.id, input.id))
      .for('update');

    if (!unit) {
      throw new ProductUnitNotFoundError(input.id);
    }

    const plantToday = getPlantDateNow();

    if (input.occurredOn > plantToday) {
      throw new ProductUnitTransferInFutureError(input.occurredOn, plantToday);
    }

    const transfers = await tx
      .select({
        id: productUnitOwnershipTransfers.id,
        createdAt: productUnitOwnershipTransfers.createdAt,
        occurredOn: productUnitOwnershipTransfers.occurredOn,
        toCustomerId: productUnitOwnershipTransfers.toCustomerId,
      })
      .from(productUnitOwnershipTransfers)
      .where(eq(productUnitOwnershipTransfers.productUnitId, input.id));

    const latest = resolveNewestOwnershipTransfer(transfers);
    const fromCustomerId = latest?.toCustomerId ?? null;

    if (fromCustomerId === input.toCustomerId) {
      throw new ProductUnitOwnerUnchangedError(input.id, fromCustomerId);
    }

    if (latest && input.occurredOn < latest.occurredOn) {
      throw new ProductUnitTransferBackdatedError(input.occurredOn, latest.occurredOn);
    }

    if (input.toCustomerId) {
      const [toCustomer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, input.toCustomerId));

      if (!toCustomer) {
        throw new CustomerNotFoundError(input.toCustomerId);
      }
    }

    await tx.insert(productUnitOwnershipTransfers).values({
      actorUserId,
      fromCustomerId,
      note: input.note,
      occurredOn: input.occurredOn,
      productUnitId: input.id,
      toCustomerId: input.toCustomerId,
    });

    await recordAuditEvent({
      action: 'updated',
      actorUserId,
      changes: {
        ownerCustomerId: { from: fromCustomerId, to: input.toCustomerId },
        ownershipTransferDate: { from: null, to: input.occurredOn },
        ...(input.note ? { ownershipTransferNote: { from: null, to: input.note } } : {}),
      },
      db: tx,
      descriptor: productUnitAuditDescriptor,
      entityId: unit.id,
      record: { productSerialNumber: unit.productSerialNumber },
    });

    return { unit: await getProductUnit({ db: tx, id: input.id }) };
  });
}
