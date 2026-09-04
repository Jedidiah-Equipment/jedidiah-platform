import { type DatabaseTransaction, type Db, getForeignKeyViolationConstraint } from '@pkg/db';
import {
  customers,
  jobs,
  productSerialSequences,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quotes,
} from '@pkg/db/equipment';
import { getPlantDateNow } from '@pkg/domain';
import { isJobCancelled, resolveNewestOwnershipTransfer } from '@pkg/domain/equipment';
import type { AuthId, DateOnlyIso, UUID } from '@pkg/schema';
import {
  formatJobCode,
  formatProductSerialNumber,
  ProductSerialPrefix,
  ProductSerialSequence,
  ProductSerialYear,
  type ProductUnitTransferInput,
  type ProductUnitTransferResult,
  type ProductUnitUpdateInput,
  type ProductUnitUpdateResult,
} from '@pkg/schema/equipment';
import { eq, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  recordAuditCreate,
  recordAuditDelete,
  recordAuditEvent,
} from '../audit/audit-service.js';
import { mutateEntity } from '../audit/mutate-entity.js';
import { CustomerNotFoundError } from '../customers/customer-errors.js';
import { jobAuditDescriptor } from '../jobs/job-audit.js';
import { quoteAuditDescriptor } from '../quotes/quote-audit.js';
import {
  ProductUnitInUseError,
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

/**
 * Whether a Quote ever placed a machine with a Customer.
 *
 * A Quote is Locked once it has sourced production, and the everyday evidence is a `job.quote_id` row —
 * a cancelled Job keeps its Quote, so cancellation cannot unlock a deal. Reassignment is the one
 * operation that takes that row away, moving the build Job to another Quote entirely, and the vacated
 * deal must stay Locked all the same. The Ownership Transfer it wrote is the durable proof: append-only,
 * and `sourceQuoteId` says exactly which deal put the machine where it went.
 *
 * A plain lookup rather than a correlated subquery on purpose. Drizzle qualifies an interpolated column
 * with its table only in some query shapes, and the relational builder renames the table besides, so a
 * shared `exists (...)` fragment silently compares the wrong two columns in whichever context it was
 * not written for. This reads the same in every caller.
 */
export async function quoteEverPlacedAUnit({
  db,
  quoteId,
}: {
  db: Db | DatabaseTransaction;
  quoteId: string;
}): Promise<boolean> {
  const [transfer] = await db
    .select({ id: productUnitOwnershipTransfers.id })
    .from(productUnitOwnershipTransfers)
    .where(eq(productUnitOwnershipTransfers.sourceQuoteId, quoteId))
    .limit(1);

  return Boolean(transfer);
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
 * Deletes a Product Unit that never became a machine: a serial minted by a build that was cancelled
 * before anything was made. The Unit is otherwise permanent — it is born with its Build Job and has no
 * soft-delete — so this is the one way out.
 *
 * One rule governs what survives: cancelled records stand, losing only their link to the machine.
 * Cancelled Jobs and cancelled Quotes are both detached, and a cancelled Job left holding neither Unit
 * nor Quote still records that someone once meant to build this. Anything not cancelled refuses —
 * a live Job, a live Quote, a Job that ever completed. Ownership does not refuse: a phantom from a
 * dead build-to-order sale is born owned, and only a person can say the machine never existed.
 *
 * The serial is not reclaimed. Its per-Product sequence never rewinds, so the number stays spent and no
 * later machine can be confused for this one.
 */
export async function removeProductUnit({
  actorUserId,
  db,
  id,
}: {
  actorUserId: AuthId;
  db: Db;
  id: UUID;
}): Promise<void> {
  await db.transaction((tx) => removeProductUnitWithin({ actorUserId, id, tx }));
}

/**
 * The removal itself, for callers already holding a transaction. Cancelling a Quote or a Stock Build
 * may take the machine with it, and those cascades must succeed or fail whole: a Unit deleted beside a
 * cancellation that then rolled back would be the very phantom this all exists to prevent.
 */
export async function removeProductUnitWithin({
  actorUserId,
  id,
  tx,
}: {
  actorUserId: AuthId;
  id: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  // The lock still matters with ownership no longer a refusal: it serializes removal against the
  // sale, reversal and hand-recorded transfer that could otherwise write against a vanishing Unit.
  const ownership = await lockUnitForOwnership(tx, id);

  if (!ownership) {
    throw new ProductUnitNotFoundError(id);
  }

  const unitQuotes = await tx
    .select({ code: quotes.code, id: quotes.id, status: quotes.status })
    .from(quotes)
    .where(eq(quotes.productUnitId, id));

  for (const quote of unitQuotes) {
    if (quote.status !== 'cancelled') {
      throw new ProductUnitInUseError(id, 'quoted');
    }
  }

  const unitJobs = await tx
    .select({
      cancelledAt: jobs.cancelledAt,
      code: jobs.code,
      completedOn: jobs.completedOn,
      id: jobs.id,
    })
    .from(jobs)
    .where(eq(jobs.productUnitId, id));

  // Completion is asked across the whole Unit before liveness because it latches and outranks every
  // open Job: one finished build is enough to say the machine exists, even while a Rework Job is live.
  const completedJob = unitJobs.find((job) => job.completedOn !== null);
  if (completedJob) {
    throw new ProductUnitInUseError(id, 'built', formatJobCode(completedJob.code));
  }

  const liveJob = unitJobs.find((job) => !isJobCancelled(job));
  if (liveJob) {
    throw new ProductUnitInUseError(id, 'live-job', formatJobCode(liveJob.code));
  }

  // Re-read for the whole row the audit event snapshots; the ownership handle carries only identity.
  const [unit] = await tx.select().from(productUnits).where(eq(productUnits.id, id));

  if (!unit) {
    throw new Error('Product Unit disappeared from under its own removal lock');
  }

  // `productUnitId` is an audited field on both, so each record loses its machine against its own
  // history — the Unit's delete event is on another entity and would leave a dangling id behind.
  for (const quote of unitQuotes) {
    await tx.update(quotes).set({ productUnitId: null, updatedAt: new Date() }).where(eq(quotes.id, quote.id));
    await recordAuditEvent({
      action: 'updated',
      actorUserId,
      changes: { productUnitId: { from: id, to: null } },
      db: tx,
      descriptor: quoteAuditDescriptor,
      entityId: quote.id,
      record: { code: quote.code },
    });
  }

  for (const job of unitJobs) {
    await tx.update(jobs).set({ productUnitId: null, updatedAt: new Date() }).where(eq(jobs.id, job.id));
    await recordAuditEvent({
      action: 'updated',
      actorUserId,
      changes: { productUnitId: { from: id, to: null } },
      db: tx,
      descriptor: jobAuditDescriptor,
      entityId: job.id,
      record: { code: job.code },
    });
  }

  // The guards above name what is holding the Unit; the FK is the backstop that keeps a referrer
  // added later failing closed as a refusal rather than a 500.
  try {
    await tx.delete(productUnits).where(eq(productUnits.id, id));
  } catch (error) {
    if (getForeignKeyViolationConstraint(error)) {
      throw new ProductUnitInUseError(id, 'referenced');
    }

    throw error;
  }

  await recordAuditDelete({ db: tx, descriptor: productUnitAuditDescriptor, actorUserId, input: unit });
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
