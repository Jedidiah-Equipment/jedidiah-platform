import { customers, type DatabaseTransaction, productUnitOwnershipTransfers } from '@pkg/db';
import { getPlantDateNow } from '@pkg/domain';
import type { AuthId, QuoteSelectedAssemblyInput, QuoteStatus, UUID } from '@pkg/schema';
import { and, eq, isNull } from 'drizzle-orm';

import { loadAsBuiltSpec } from '../units/product-unit-as-built.js';
import { lockUnitForOwnership } from '../units/product-unit-service.js';
import { QuoteAllocationConflictError, QuoteInvalidReferenceError } from './quote-errors.js';

/**
 * Where an Allocation Quote meets the machine it sells. The Quote decides *when* ownership moves — on
 * acceptance, and back on cancellation — while the ownership log itself is written by the Units
 * package, so a sale and a hand-recorded resale leave the same trail.
 */

/**
 * Accepting an Allocation Quote is the sale. It moves the Unit to the Quote's Customer, and it is the
 * authoritative event: the Unit's row lock makes competing acceptances serialize, so the second one
 * sees the first one's Transfer and is refused rather than both reading the same Stock state.
 */
export async function transferAllocationQuoteOnAcceptance({
  actorUserId,
  previousStatus,
  quote,
  tx,
}: {
  actorUserId: AuthId;
  previousStatus: QuoteStatus | null;
  quote: {
    customerId: string;
    id: string;
    productUnitId: string | null;
    status: QuoteStatus;
  };
  tx: DatabaseTransaction;
}): Promise<void> {
  if (!quote.productUnitId || quote.status !== 'accepted' || previousStatus === 'accepted') {
    return;
  }

  const ownership = await lockUnitForOwnership(tx, quote.productUnitId);

  if (!ownership) {
    throw new QuoteInvalidReferenceError('Product Unit was not found.');
  }

  if (ownership.currentOwnerId) {
    throw await createQuoteAllocationConflictError({
      currentOwnerId: ownership.currentOwnerId,
      productSerialNumber: ownership.unit.productSerialNumber,
      tx,
    });
  }

  await ownership.record({
    actorUserId,
    occurredOn: getPlantDateNow(),
    sourceQuoteId: quote.id,
    toCustomerId: quote.customerId,
  });
}

/**
 * Cancelling the Quote that sold a Unit hands the machine back. The reversal is a further Transfer,
 * never a deletion — the sale did happen, and the log says so.
 *
 * Refused when the Unit has moved on since: a later Transfer means someone else's record now depends
 * on this one, so cancelling here would silently take the machine off its current Owner.
 */
export async function returnQuoteProductUnitToStock({
  actorUserId,
  customerId,
  occurredOn,
  quoteId,
  tx,
}: {
  actorUserId: AuthId;
  customerId: string;
  occurredOn: string;
  quoteId: string;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [saleTransfer] = await tx
    .select({ productUnitId: productUnitOwnershipTransfers.productUnitId })
    .from(productUnitOwnershipTransfers)
    .where(
      and(
        eq(productUnitOwnershipTransfers.sourceQuoteId, quoteId),
        isNull(productUnitOwnershipTransfers.fromCustomerId),
        eq(productUnitOwnershipTransfers.toCustomerId, customerId),
      ),
    )
    .limit(1);

  if (!saleTransfer) {
    return;
  }

  const ownership = await lockUnitForOwnership(tx, saleTransfer.productUnitId);

  if (!ownership) {
    throw new QuoteInvalidReferenceError('Product Unit was not found.');
  }

  const { latest, unit } = ownership;

  if (latest?.toCustomerId !== customerId || latest.sourceQuoteId !== quoteId) {
    throw new QuoteAllocationConflictError(
      `Product Unit ${unit.productSerialNumber} has a later Ownership Transfer and cannot be returned to Stock by cancelling this Quote.`,
    );
  }

  await ownership.record({
    actorUserId,
    occurredOn,
    sourceQuoteId: quoteId,
    toCustomerId: null,
  });
}

/**
 * The Assemblies an Allocation Quote starts with: the ones already fitted to the machine, charged as
 * if built to order. The Unit must be Stock — we cannot sell what a Customer already owns — and the
 * row lock taken here is the same one the acceptance transfer takes, making the Stock check and the
 * Quote insert one serialized decision.
 */
export async function resolveAllocationQuoteSeed({
  accepting,
  productId,
  productUnitId,
  tx,
}: {
  accepting: boolean;
  productId: UUID;
  productUnitId: UUID;
  tx: DatabaseTransaction;
}): Promise<QuoteSelectedAssemblyInput[]> {
  const ownership = await lockUnitForOwnership(tx, productUnitId);

  if (!ownership) {
    throw new QuoteInvalidReferenceError('Product Unit was not found.');
  }
  if (ownership.unit.productId !== productId) {
    throw new QuoteInvalidReferenceError('Product Unit does not match the Quote Product.');
  }

  if (ownership.currentOwnerId) {
    // Selling outright names the Owner standing in the way; drafting only reports the state, because a
    // salesperson picking a Unit has no business reading who owns it from an error message.
    throw accepting
      ? await createQuoteAllocationConflictError({
          currentOwnerId: ownership.currentOwnerId,
          productSerialNumber: ownership.unit.productSerialNumber,
          tx,
        })
      : new QuoteInvalidReferenceError('Product Unit is not Stock.');
  }

  const asBuilt = await loadAsBuiltSpec({ db: tx, productUnitId });
  const liveAssemblyIds = new Set<UUID>();

  for (const assembly of asBuilt) {
    if (!assembly.productAssemblyId) {
      throw new QuoteInvalidReferenceError("Product Unit's As-Built Spec contains an unavailable Optional Assembly.");
    }
    liveAssemblyIds.add(assembly.productAssemblyId);
  }

  return [...liveAssemblyIds].map((productAssemblyId) => ({ type: 'catalog', productAssemblyId }));
}

/**
 * The As-Built Assemblies always lead an Allocation Quote's selections: the machine already carries
 * them, so a create that omits one still gets it. A caller selection naming a seeded Assembly is
 * dropped in favour of the seed rather than duplicating it; everything else is added on top.
 *
 * Only creation seeds. A later update may remove a seeded Assembly — repricing a machine already built
 * is a commercial decision, and the Unit's As-Built Spec still records what is fitted either way.
 */
export function mergeAllocationSeed({
  input,
  seed,
}: {
  input: readonly QuoteSelectedAssemblyInput[];
  seed: readonly QuoteSelectedAssemblyInput[];
}): QuoteSelectedAssemblyInput[] {
  const seededIds = new Set(
    seed.flatMap((selection) => (selection.type === 'catalog' ? [selection.productAssemblyId] : [])),
  );

  return [
    ...seed,
    ...input.filter((selection) => selection.type !== 'catalog' || !seededIds.has(selection.productAssemblyId)),
  ];
}

async function createQuoteAllocationConflictError({
  currentOwnerId,
  productSerialNumber,
  tx,
}: {
  currentOwnerId: string;
  productSerialNumber: string;
  tx: DatabaseTransaction;
}): Promise<QuoteAllocationConflictError> {
  const [owner] = await tx
    .select({ companyName: customers.companyName })
    .from(customers)
    .where(eq(customers.id, currentOwnerId));
  const ownerName = owner?.companyName ?? 'another Customer';

  return new QuoteAllocationConflictError(
    `Product Unit ${productSerialNumber} is already owned by ${ownerName} and cannot be sold by this Quote.`,
  );
}
