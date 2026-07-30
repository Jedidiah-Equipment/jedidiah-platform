import {
  customers,
  type DatabaseTransaction,
  type Db,
  productSerialSequences,
  products,
  productUnitOwnershipTransfers,
  productUnits,
} from '@pkg/db';
import { getPlantDateNow, resolveNewestOwnershipTransfer } from '@pkg/domain';
import {
  type AuthId,
  type DateOnlyIso,
  formatProductSerialNumber,
  ProductSerialPrefix,
  ProductSerialSequence,
  ProductSerialYear,
  type ProductUnitTransferInput,
  type ProductUnitTransferResult,
  type ProductUnitUpdateInput,
  type ProductUnitUpdateResult,
  type UUID,
} from '@pkg/schema';
import { eq, sql } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate, recordAuditEvent } from '../audit/audit-service.js';
import { mutateEntity } from '../audit/mutate-entity.js';
import { CustomerNotFoundError } from '../customers/customer-errors.js';
import {
  ProductUnitNotFoundError,
  ProductUnitOwnerUnchangedError,
  ProductUnitProductNotFoundError,
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

/**
 * The only way a Product Unit comes into being. It mints the per-Product serial, audits the new
 * machine, and records initial ownership through the same locked handle used by later Transfers.
 */
export async function createProductUnit({
  actorUserId,
  initialOwner,
  plantToday,
  productId,
  tx,
}: {
  actorUserId: AuthId;
  initialOwner: { customerId: string; sourceQuoteId: string } | null;
  plantToday: DateOnlyIso;
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<ProductUnitRow> {
  // Soft-removal hides a Product from new catalog choices, but an accepted historical Quote may still
  // start the promised build. Stock Builds reject removed Products before reaching this interface.
  const [product] = await tx
    .select({ modelCode: products.modelCode })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    throw new ProductUnitProductNotFoundError(productId);
  }

  const serial = await createProductSerial({ modelCode: product.modelCode, plantToday, productId, tx });
  const [unit] = await tx
    .insert(productUnits)
    .values({
      productId,
      productSerialNumber: serial.number,
      productSerialPrefix: serial.prefix,
      productSerialSequence: serial.sequence,
      productSerialYear: serial.year,
    })
    .returning();

  if (!unit) {
    throw new Error('Product unit insert did not return a row');
  }

  await recordAuditCreate({ db: tx, descriptor: productUnitAuditDescriptor, actorUserId, input: unit });

  if (initialOwner) {
    const ownership = await lockUnitForOwnership(tx, unit.id);

    if (!ownership) {
      throw new Error('Newly inserted Product Unit was not found under its ownership lock');
    }

    await ownership.record({
      actorUserId,
      occurredOn: plantToday,
      sourceQuoteId: initialOwner.sourceQuoteId,
      toCustomerId: initialOwner.customerId,
    });
  }

  return unit;
}

type ProductSerial = {
  number: string;
  prefix: string;
  sequence: number;
  year: number;
};

async function createProductSerial({
  modelCode,
  plantToday,
  productId,
  tx,
}: {
  modelCode: string;
  plantToday: DateOnlyIso;
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<ProductSerial> {
  const now = new Date();
  const [sequenceRow] = await tx
    .insert(productSerialSequences)
    .values({
      lastSequence: 1,
      productId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: productSerialSequences.productId,
      set: {
        lastSequence: sql`${productSerialSequences.lastSequence} + 1`,
        updatedAt: now,
      },
    })
    .returning({
      lastSequence: productSerialSequences.lastSequence,
    });

  if (!sequenceRow) {
    throw new Error('Product serial sequence upsert did not return a row');
  }

  const prefix = ProductSerialPrefix.parse(modelCode);
  const year = ProductSerialYear.parse(getPlantDateTwoDigitYear(plantToday));
  const sequence = ProductSerialSequence.parse(sequenceRow.lastSequence);

  return {
    number: formatProductSerialNumber({ prefix, sequence, year }),
    prefix,
    sequence,
    year,
  };
}

function getPlantDateTwoDigitYear(plantDate: DateOnlyIso): number {
  return Number.parseInt(plantDate.slice(2, 4), 10);
}

/** The Unit facts every ownership writer needs: the row it locks, and the serial its audit event names. */
export type OwnershipUnitRow = { id: string; productSerialNumber: string };

type OwnershipTransferRow = {
  createdAt: Date;
  id: string;
  occurredOn: string;
  sourceQuoteId: string | null;
  toCustomerId: string | null;
};

/** The ownership state read under the Unit's row lock, and the only way to append to its log. */
export type UnitOwnershipHandle = {
  currentOwnerId: string | null;
  latest: OwnershipTransferRow | null;
  unit: OwnershipUnitRow & { productId: string };

  /**
   * Appends one Ownership Transfer and its audit event after rejecting future dates, backdates, and
   * no-ops. The origin comes from the locked state; callers retain their own stronger preconditions.
   */
  record(input: {
    actorUserId: AuthId;
    note?: string | null;
    occurredOn: string;
    sourceQuoteId?: string | null;
    toCustomerId: string | null;
  }): Promise<void>;
};

/**
 * Takes the Unit's row lock and reads its ownership log under it. Returns null when the Unit does not
 * exist, leaving the caller to raise the boundary-specific error its own surface owes.
 */
export async function lockUnitForOwnership(
  tx: DatabaseTransaction,
  productUnitId: string,
): Promise<UnitOwnershipHandle | null> {
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

  const ownership: UnitOwnershipHandle = {
    currentOwnerId: latest?.toCustomerId ?? null,
    latest,
    async record(input) {
      const plantToday = getPlantDateNow();
      assertOwnershipTransferAllowed({
        currentOwnerId: ownership.currentOwnerId,
        latest: ownership.latest,
        occurredOn: input.occurredOn,
        plantToday,
        productUnitId: ownership.unit.id,
        toCustomerId: input.toCustomerId,
      });

      // PostgreSQL's default `now()` is transaction-stable. Advance same-day timestamps explicitly so
      // persisted owner resolution cannot fall through to random UUID ordering after two handle writes.
      const createdAt =
        ownership.latest && input.occurredOn === ownership.latest.occurredOn
          ? new Date(Math.max(Date.now(), ownership.latest.createdAt.getTime() + 1))
          : undefined;
      const transfer = await appendOwnershipTransfer({
        actorUserId: input.actorUserId,
        fromCustomerId: ownership.currentOwnerId,
        occurredOn: input.occurredOn,
        toCustomerId: input.toCustomerId,
        tx,
        unit: ownership.unit,
        ...(createdAt ? { createdAt } : {}),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.sourceQuoteId === undefined ? {} : { sourceQuoteId: input.sourceQuoteId }),
      });

      ownership.currentOwnerId = input.toCustomerId;
      ownership.latest = transfer;
    },
    unit,
  };

  return ownership;
}

function assertOwnershipTransferAllowed({
  currentOwnerId,
  latest,
  occurredOn,
  plantToday,
  productUnitId,
  toCustomerId,
}: {
  currentOwnerId: string | null;
  latest: OwnershipTransferRow | null;
  occurredOn: string;
  plantToday: DateOnlyIso;
  productUnitId: string;
  toCustomerId: string | null;
}): void {
  if (occurredOn > plantToday) {
    throw new ProductUnitTransferInFutureError(occurredOn, plantToday);
  }

  if (toCustomerId === currentOwnerId) {
    throw new ProductUnitOwnerUnchangedError(productUnitId, currentOwnerId);
  }

  if (latest && occurredOn < latest.occurredOn) {
    throw new ProductUnitTransferBackdatedError(occurredOn, latest.occurredOn);
  }
}

/**
 * Appends the Transfer and audit event after the locked handle has applied the invariants every
 * ownership move owes.
 */
async function appendOwnershipTransfer({
  actorUserId,
  createdAt,
  fromCustomerId,
  note,
  occurredOn,
  sourceQuoteId,
  toCustomerId,
  tx,
  unit,
}: {
  actorUserId: AuthId;
  createdAt?: Date;
  fromCustomerId: string | null;
  note?: string | null;
  occurredOn: string;
  sourceQuoteId?: string | null;
  toCustomerId: string | null;
  tx: DatabaseTransaction;
  unit: OwnershipUnitRow;
}): Promise<OwnershipTransferRow> {
  const [transfer] = await tx
    .insert(productUnitOwnershipTransfers)
    .values({
      actorUserId,
      fromCustomerId,
      note: note ?? null,
      occurredOn,
      productUnitId: unit.id,
      sourceQuoteId: sourceQuoteId ?? null,
      toCustomerId,
      ...(createdAt ? { createdAt } : {}),
    })
    .returning({
      createdAt: productUnitOwnershipTransfers.createdAt,
      id: productUnitOwnershipTransfers.id,
      occurredOn: productUnitOwnershipTransfers.occurredOn,
      sourceQuoteId: productUnitOwnershipTransfers.sourceQuoteId,
      toCustomerId: productUnitOwnershipTransfers.toCustomerId,
    });

  if (!transfer) {
    throw new Error('Product Unit Ownership Transfer insert did not return a row');
  }

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

  return transfer;
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
  return mutateEntity({
    actorUserId,
    db,
    descriptor: productUnitAuditDescriptor,
    id: input.id,
    notFound: () => new ProductUnitNotFoundError(input.id),
    project: async (tx, row) => ({ unit: await getProductUnit({ db: tx, id: row.id }) }),
    set: () => ({ updatedAt: new Date(), vinNumber: input.vinNumber }),
    table: productUnits,
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
    const ownership = await lockUnitForOwnership(tx, input.id);

    if (!ownership) {
      throw new ProductUnitNotFoundError(input.id);
    }

    // Preserve the manual API's historical error precedence. `record()` repeats these checks because
    // every other writer must remain unable to bypass them.
    assertOwnershipTransferAllowed({
      currentOwnerId: ownership.currentOwnerId,
      latest: ownership.latest,
      occurredOn: input.occurredOn,
      plantToday: getPlantDateNow(),
      productUnitId: ownership.unit.id,
      toCustomerId: input.toCustomerId,
    });

    if (input.toCustomerId) {
      const [toCustomer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, input.toCustomerId));

      if (!toCustomer) {
        throw new CustomerNotFoundError(input.toCustomerId);
      }
    }

    await ownership.record({
      actorUserId,
      note: input.note,
      occurredOn: input.occurredOn,
      toCustomerId: input.toCustomerId,
    });

    return { unit: await getProductUnit({ db: tx, id: input.id }) };
  });
}
