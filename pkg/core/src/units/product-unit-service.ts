import { customers, type DatabaseTransaction, type Db, productUnitOwnershipTransfers, productUnits } from '@pkg/db';
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

/** The Unit facts every ownership writer needs: the row it locks, and the serial its audit event names. */
export type OwnershipUnitRow = { id: string; productSerialNumber: string };

type OwnershipTransferRow = {
  createdAt: Date;
  id: string;
  occurredOn: string;
  sourceQuoteId: string | null;
  toCustomerId: string | null;
};

/**
 * Takes the Unit's row lock and reads its ownership log under it, so competing writers observe each
 * other's Transfer instead of both deciding from the same stale state.
 *
 * Returns `null` when the Unit does not exist: the caller raises the boundary error its own surface
 * owes — a Quote reports an invalid reference, the Units API reports a missing Unit.
 */
export async function lockProductUnitOwnership({
  productUnitId,
  tx,
}: {
  productUnitId: string;
  tx: DatabaseTransaction;
}): Promise<{
  currentOwnerId: string | null;
  latest: OwnershipTransferRow | null;
  unit: OwnershipUnitRow & { productId: string };
} | null> {
  const [unit] = await tx
    .select({
      id: productUnits.id,
      productId: productUnits.productId,
      productSerialNumber: productUnits.productSerialNumber,
    })
    .from(productUnits)
    .where(eq(productUnits.id, productUnitId))
    .for('update');

  if (!unit) {
    return null;
  }

  const transfers = await tx
    .select({
      createdAt: productUnitOwnershipTransfers.createdAt,
      id: productUnitOwnershipTransfers.id,
      occurredOn: productUnitOwnershipTransfers.occurredOn,
      sourceQuoteId: productUnitOwnershipTransfers.sourceQuoteId,
      toCustomerId: productUnitOwnershipTransfers.toCustomerId,
    })
    .from(productUnitOwnershipTransfers)
    .where(eq(productUnitOwnershipTransfers.productUnitId, productUnitId));
  const latest = resolveNewestOwnershipTransfer(transfers);

  return { currentOwnerId: latest?.toCustomerId ?? null, latest, unit };
}

/**
 * The only writer of the ownership log. Appends the Transfer and records the Product Unit audit event
 * that makes the change discoverable in the workspace-wide feed.
 *
 * Every ownership move goes through here — a sale, a cancellation reversing one, a resale we were not
 * party to — so the log and the audit trail cannot disagree about who holds a machine. Callers keep
 * only the precondition their own path owes, having read the current owner from
 * `lockProductUnitOwnership` (or, for a Unit created in this same transaction, knowing it has none).
 */
export async function appendOwnershipTransfer({
  actorUserId,
  fromCustomerId,
  note,
  occurredOn,
  sourceQuoteId,
  toCustomerId,
  tx,
  unit,
}: {
  actorUserId: AuthId;
  fromCustomerId: string | null;
  note?: string | null;
  occurredOn: string;
  sourceQuoteId?: string | null;
  toCustomerId: string | null;
  tx: DatabaseTransaction;
  unit: OwnershipUnitRow;
}): Promise<void> {
  await tx.insert(productUnitOwnershipTransfers).values({
    actorUserId,
    fromCustomerId,
    note: note ?? null,
    occurredOn,
    productUnitId: unit.id,
    sourceQuoteId: sourceQuoteId ?? null,
    toCustomerId,
  });

  await recordAuditEvent({
    action: 'updated',
    actorUserId,
    changes: {
      ownerCustomerId: { from: fromCustomerId, to: toCustomerId },
      ownershipTransferDate: { from: null, to: occurredOn },
      ...(note ? { ownershipTransferNote: { from: null, to: note } } : {}),
    },
    db: tx,
    descriptor: productUnitAuditDescriptor,
    entityId: unit.id,
    record: { productSerialNumber: unit.productSerialNumber },
  });
}

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
    const ownership = await lockProductUnitOwnership({ productUnitId: input.id, tx });

    if (!ownership) {
      throw new ProductUnitNotFoundError(input.id);
    }

    const { currentOwnerId, latest, unit } = ownership;
    const plantToday = getPlantDateNow();

    if (input.occurredOn > plantToday) {
      throw new ProductUnitTransferInFutureError(input.occurredOn, plantToday);
    }

    if (currentOwnerId === input.toCustomerId) {
      throw new ProductUnitOwnerUnchangedError(input.id, currentOwnerId);
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

    await appendOwnershipTransfer({
      actorUserId,
      fromCustomerId: currentOwnerId,
      note: input.note,
      occurredOn: input.occurredOn,
      toCustomerId: input.toCustomerId,
      tx,
      unit,
    });

    return { unit: await getProductUnit({ db: tx, id: input.id }) };
  });
}
