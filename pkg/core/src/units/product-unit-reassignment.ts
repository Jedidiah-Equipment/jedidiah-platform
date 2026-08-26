import { type DatabaseTransaction, type Db, jobs, quotes } from '@pkg/db';
import { getPlantDateNow } from '@pkg/domain';
import {
  type AuthId,
  formatJobCode,
  ProductSerialNumber,
  type ProductUnitReassignInput,
  type ProductUnitReassignResult,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { recordAuditEvent } from '../audit/audit-service.js';
import { jobAuditDescriptor } from '../jobs/job-audit.js';
import { quoteAuditDescriptor } from '../quotes/quote-audit.js';
import { QuoteNotFoundError } from '../quotes/quote-errors.js';
import { ProductUnitNotFoundError } from './product-unit-errors.js';
import { getProductUnit } from './product-unit-read-service.js';
import {
  ProductUnitReassignDeadJobError,
  ProductUnitReassignDisplacedOwnerError,
  ProductUnitReassignQuoteIneligibleError,
  ProductUnitReassignUnitIneligibleError,
  type ProductUnitReassignUnitIneligibleReason,
} from './product-unit-reassignment-errors.js';
import { lockUnitForOwnership, type UnitOwnershipHandle } from './product-unit-service.js';

/** The receiving Quote's facts, read under its row lock. */
export type ReceivingQuoteRow = {
  customerId: string;
  id: string;
  productId: string;
};

/** A live Job on a machine, with the one fact that says whether it is a build or a rework. */
export type ClassifiableJob = {
  quoteId: string | null;
  /** The Job's Quote's own `productUnitId`, or null when the Job has no Quote. */
  quoteProductUnitId: string | null;
};

/**
 * A Rework Job hangs off an Allocation Quote — a deal that named the machine rather than ordering one.
 * Everything else live on a Unit is its build, whether that build has a Quote (built to order) or none
 * at all (a Stock Build).
 */
export function isReworkJob(job: ClassifiableJob): boolean {
  return job.quoteId !== null && job.quoteProductUnitId !== null;
}

/** A deal, as the eligibility rules read it: only whether it has been billed, and what it names. */
export type ReassignSourceQuote = {
  invoiceNumber: string | null;
  productUnitId: string | null;
};

/** Everything the eligibility rules ask about one candidate machine. */
export type ReassignUnitFacts = {
  /** The deal the machine's build Job hangs off, or `null` for a Stock Build that hangs off none. */
  buildJobQuote: ReassignSourceQuote | null;
  /** The machine's live Jobs, earliest first. */
  liveJobs: readonly ClassifiableJob[];
  /** The Customer holding the machine now; `null` is Stock. */
  ownerId: string | null;
  productId: string;
  /** The deal that placed the machine with its Owner, or `null` when no readable deal did. */
  sellingQuote: ReassignSourceQuote | null;
};

/**
 * Why this machine may not move onto a deal selling `receivingProductId`, or `null` when it may. One
 * rule set, called under the write's locks and again by the picker, so what is offered and what is
 * accepted cannot drift apart.
 *
 * Invoicing is the wall on both sides, and the selling side has two doors. The deal the build Job is
 * *leaving* is one of them whoever owns the machine today — a hand-recorded return to Stock does not
 * un-bill an invoice, and detaching a billed deal's Job would leave the paperwork describing a machine
 * that is no longer coming. The deal that placed the machine with its current Owner is the other.
 *
 * A Unit held by a Customer with no sourcing Quote behind it was moved by hand: our records attribute
 * the machine to a third party outside any deal of ours, and reassigning it would overwrite that.
 */
export function resolveReassignUnitIneligibility(
  facts: ReassignUnitFacts,
  receivingProductId: string,
): ProductUnitReassignUnitIneligibleReason | null {
  if (facts.productId !== receivingProductId) return 'wrong-product';
  if (facts.liveJobs.some(isReworkJob)) return 'live-rework';
  if (facts.liveJobs.length === 0) return 'no-live-build-job';
  if (facts.buildJobQuote && facts.buildJobQuote.invoiceNumber !== null) return 'selling-quote-invoiced';
  if (facts.ownerId === null) return null;
  if (!facts.sellingQuote) return 'owned-outside-deal';
  if (facts.sellingQuote.invoiceNumber !== null) return 'selling-quote-invoiced';

  return null;
}

/** The Job facts every re-point needs: the row to update, and the code its audit event names. */
type AuditedJobRow = {
  code: number;
  id: string;
  quoteId: string | null;
};

type DisplacedJobRow = AuditedJobRow & { productUnitId: string | null };

/**
 * Moves an un-invoiced Product Unit — together with its build Job — onto a different accepted Product
 * Quote. The Job is the Unit's build record, so the two move as one indivisible package: the Job's
 * Quote link re-points, and the ownership log gains a direct Transfer to the receiving Customer.
 * Nothing about the machine itself changes, because serial, VIN and history were never separable from it.
 *
 * When the receiving Quote already holds a machine, that build is displaced in the same transaction:
 * its Job becomes a Stock Build and its Unit gets an honest reversal Transfer back to Stock. The
 * displacement is written *first*, because `job_quote_id_live_unique` would otherwise see two live Jobs
 * on one Quote for the length of a statement.
 *
 * The deal the machine came from is left standing, accepted and locked with no live Job. That gap is
 * deliberate and visible: only a person can say whether it should be filled by a replacement build or
 * by a second reassignment.
 */
export async function reassignProductUnitToQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: ProductUnitReassignInput;
}): Promise<ProductUnitReassignResult> {
  return db.transaction(async (tx) => {
    const plantToday = getPlantDateNow();
    const quote = await lockReceivingQuote(tx, input.toQuoteId);
    const displacedJob = await lockLiveJobForQuote(tx, quote.id);

    if (displacedJob?.productUnitId === input.productUnitId) {
      throw new ProductUnitReassignUnitIneligibleError(input.productUnitId, 'already-on-quote');
    }

    const liveJobs = await lockLiveJobsForUnit(tx, input.productUnitId);
    const handles = await lockUnitsSorted(tx, [input.productUnitId, displacedJob?.productUnitId ?? null]);
    const moving = handles.get(input.productUnitId);

    if (!moving) {
      throw new ProductUnitNotFoundError(input.productUnitId);
    }

    const sourceAllocationQuoteId = await assertUnitEligible({ liveJobs, moving, quote, tx });
    // Eligibility has already refused an empty list and any live rework, so the earliest Job is the build.
    const movingJob = liveJobs[0] as AuditedJobRow;

    let displacedProductSerialNumber: ProductSerialNumber | null = null;

    if (displacedJob?.productUnitId) {
      const displaced = handles.get(displacedJob.productUnitId);

      if (!displaced) {
        throw new ProductUnitNotFoundError(displacedJob.productUnitId);
      }

      displacedProductSerialNumber = ProductSerialNumber.parse(displaced.unit.productSerialNumber);

      if (displaced.currentOwnerId !== quote.customerId) {
        throw new ProductUnitReassignDisplacedOwnerError(displaced.unit.id, displaced.unit.productSerialNumber);
      }

      await displaced.record({
        actorUserId,
        note: input.note,
        occurredOn: plantToday,
        sourceQuoteId: quote.id,
        toCustomerId: null,
      });
      await repointJobQuote({ actorUserId, job: displacedJob, toQuoteId: null, tx });
    }

    if (sourceAllocationQuoteId) {
      await clearQuoteProductUnit({ actorUserId, quoteId: sourceAllocationQuoteId, tx });
    }

    // Moving between two deals of the same Customer moves no machine, and the ownership log records
    // moves. The Job's own audit events carry the reassignment in that case.
    if (moving.currentOwnerId !== quote.customerId) {
      await moving.record({
        actorUserId,
        note: input.note,
        occurredOn: plantToday,
        sourceQuoteId: quote.id,
        toCustomerId: quote.customerId,
      });
    }

    await repointJobQuote({ actorUserId, job: movingJob, toQuoteId: quote.id, tx });

    return {
      displacedProductSerialNumber,
      jobId: movingJob.id,
      unit: await getProductUnit({ db: tx, id: input.productUnitId }),
    };
  });
}

export type ReceiverCandidateQuote = {
  id: string;
  invoiceNumber: string | null;
  kind: string;
  productId: string | null;
  productUnitId: string | null;
  status: string;
};

/**
 * The Quotes that may receive a machine: accepted Product Quotes that have not been invoiced and do not
 * already name a Unit of their own. An Allocation Quote is excluded as a receiver because it links to
 * its machine through `quote.productUnitId` rather than through a build Job, and reassignment only ever
 * speaks the Job link.
 */
export function assertQuoteCanReceive<TQuote extends ReceiverCandidateQuote>(
  quote: TQuote,
): asserts quote is TQuote & { productId: string } {
  if (quote.kind !== 'product' || quote.productId === null) {
    throw new ProductUnitReassignQuoteIneligibleError(quote.id, 'not-product');
  }
  if (quote.status !== 'accepted') {
    throw new ProductUnitReassignQuoteIneligibleError(quote.id, 'not-accepted');
  }
  if (quote.invoiceNumber !== null) {
    throw new ProductUnitReassignQuoteIneligibleError(quote.id, 'invoiced');
  }
  if (quote.productUnitId !== null) {
    throw new ProductUnitReassignQuoteIneligibleError(quote.id, 'allocation-quote');
  }
}

async function lockReceivingQuote(tx: DatabaseTransaction, quoteId: UUID): Promise<ReceivingQuoteRow> {
  const [quote] = await tx
    .select({
      customerId: quotes.customerId,
      id: quotes.id,
      invoiceNumber: quotes.invoiceNumber,
      kind: quotes.kind,
      productId: quotes.productId,
      productUnitId: quotes.productUnitId,
      status: quotes.status,
    })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .for('update');

  if (!quote) {
    throw new QuoteNotFoundError(quoteId);
  }

  assertQuoteCanReceive(quote);

  return { customerId: quote.customerId, id: quote.id, productId: quote.productId };
}

/**
 * The Quote's live Job, if it has one. A Job that has lost its machine to Unit Removal cannot be
 * displaced — there is nothing to send back to Stock — so it is refused rather than silently detached.
 */
async function lockLiveJobForQuote(tx: DatabaseTransaction, quoteId: string): Promise<DisplacedJobRow | null> {
  const [job] = await tx
    .select({ code: jobs.code, id: jobs.id, productUnitId: jobs.productUnitId, quoteId: jobs.quoteId })
    .from(jobs)
    .where(and(eq(jobs.quoteId, quoteId), isNull(jobs.cancelledAt)))
    .for('update');

  if (!job) {
    return null;
  }

  if (job.productUnitId === null) {
    throw new ProductUnitReassignDeadJobError(job.id, formatJobCode(job.code));
  }

  return job;
}

/**
 * The machine's live Jobs under their row locks, earliest first, each carrying the one Quote fact that
 * says whether it is a build or a rework. Classifying them is `resolveReassignUnitIneligibility`'s job,
 * not this one's — locking and judging stay apart so the picker can judge without locking anything.
 */
async function lockLiveJobsForUnit(
  tx: DatabaseTransaction,
  productUnitId: UUID,
): Promise<(AuditedJobRow & ClassifiableJob)[]> {
  return tx
    .select({
      code: jobs.code,
      id: jobs.id,
      quoteId: jobs.quoteId,
      quoteProductUnitId: quotes.productUnitId,
    })
    .from(jobs)
    .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
    .where(and(eq(jobs.productUnitId, productUnitId), isNull(jobs.cancelledAt)))
    .orderBy(asc(jobs.createdAt), asc(jobs.id))
    .for('update', { of: jobs });
}

/**
 * Both Units' ownership handles, taken in ascending id order. Two reassignments crossing the same pair
 * of machines must serialize on that order rather than deadlock holding one lock each.
 */
async function lockUnitsSorted(
  tx: DatabaseTransaction,
  productUnitIds: readonly (string | null)[],
): Promise<Map<string, UnitOwnershipHandle>> {
  const ids = [...new Set(productUnitIds.filter((id): id is string => id !== null))].toSorted();
  const handles = new Map<string, UnitOwnershipHandle>();

  for (const id of ids) {
    const handle = await lockUnitForOwnership(tx, id);

    if (!handle) {
      throw new ProductUnitNotFoundError(id);
    }

    handles.set(id, handle);
  }

  return handles;
}

/**
 * Runs the shared eligibility rules against the locked state, and returns the Allocation Quote that
 * sold this machine — whose `productUnitId` the caller must clear — when one did.
 */
async function assertUnitEligible({
  liveJobs,
  moving,
  quote,
  tx,
}: {
  liveJobs: readonly (AuditedJobRow & ClassifiableJob)[];
  moving: UnitOwnershipHandle;
  quote: ReceivingQuoteRow;
  tx: DatabaseTransaction;
}): Promise<string | null> {
  const sourceQuoteId = moving.currentOwnerId === null ? null : (moving.latest?.sourceQuoteId ?? null);
  const buildJobQuoteId = liveJobs.find((job) => !isReworkJob(job))?.quoteId ?? null;
  const relatedQuotes = await loadReassignSourceQuotes(tx, [sourceQuoteId, buildJobQuoteId]);
  const sellingQuote = sourceQuoteId ? (relatedQuotes.get(sourceQuoteId) ?? null) : null;
  const reason = resolveReassignUnitIneligibility(
    {
      buildJobQuote: buildJobQuoteId ? (relatedQuotes.get(buildJobQuoteId) ?? null) : null,
      liveJobs,
      ownerId: moving.currentOwnerId,
      productId: moving.unit.productId,
      sellingQuote,
    },
    quote.productId,
  );

  if (reason) {
    throw new ProductUnitReassignUnitIneligibleError(moving.unit.id, reason);
  }

  return sellingQuote?.productUnitId === moving.unit.id ? sourceQuoteId : null;
}

/** The deals the eligibility rules need to read, in one statement. */
export async function loadReassignSourceQuotes(
  db: Db | DatabaseTransaction,
  quoteIds: readonly (string | null)[],
): Promise<Map<string, ReassignSourceQuote>> {
  const ids = [...new Set(quoteIds.filter((id): id is string => id !== null))];

  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ id: quotes.id, invoiceNumber: quotes.invoiceNumber, productUnitId: quotes.productUnitId })
    .from(quotes)
    .where(inArray(quotes.id, ids));

  return new Map(rows.map((row) => [row.id, { invoiceNumber: row.invoiceNumber, productUnitId: row.productUnitId }]));
}

/**
 * The Allocation Quote that sold this machine loses it, against its own audit history. Same rule as
 * Unit Removal: `productUnitId` is an audited field on the Quote, so the change belongs on the Quote's
 * own record rather than buried in an event about the Unit.
 */
async function clearQuoteProductUnit({
  actorUserId,
  quoteId,
  tx,
}: {
  actorUserId: AuthId;
  quoteId: string;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [quote] = await tx
    .select({ code: quotes.code, id: quotes.id, productUnitId: quotes.productUnitId })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .for('update');

  if (!quote || quote.productUnitId === null) {
    return;
  }

  await tx.update(quotes).set({ productUnitId: null, updatedAt: new Date() }).where(eq(quotes.id, quote.id));
  await recordAuditEvent({
    action: 'updated',
    actorUserId,
    changes: { productUnitId: { from: quote.productUnitId, to: null } },
    db: tx,
    descriptor: quoteAuditDescriptor,
    entityId: quote.id,
    record: { code: quote.code },
  });
}

/** The whole mechanism of reassignment: one audited column on the Job, moved from one deal to another. */
async function repointJobQuote({
  actorUserId,
  job,
  toQuoteId,
  tx,
}: {
  actorUserId: AuthId;
  job: AuditedJobRow;
  toQuoteId: string | null;
  tx: DatabaseTransaction;
}): Promise<void> {
  await tx.update(jobs).set({ quoteId: toQuoteId, updatedAt: new Date() }).where(eq(jobs.id, job.id));
  await recordAuditEvent({
    action: 'updated',
    actorUserId,
    changes: { quoteId: { from: job.quoteId, to: toQuoteId } },
    db: tx,
    descriptor: jobAuditDescriptor,
    entityId: job.id,
    record: { code: job.code },
  });
}
