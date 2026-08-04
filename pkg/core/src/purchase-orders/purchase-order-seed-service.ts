import { type Db, parts, supplier } from '@pkg/db';
import type { AuthId, PurchaseOrderSeedInput, PurchaseOrderSeedResult, UUID } from '@pkg/schema';
import {
  isWholeUnitQuantity,
  PurchaseOrderSeedResult as PurchaseOrderSeedResultSchema,
  unitClassFor,
} from '@pkg/schema';
import { eq, inArray } from 'drizzle-orm';

import {
  PurchaseOrderInvalidQuantityError,
  PurchaseOrderPartNotFoundError,
  PurchaseOrderPartNotPurchasableError,
} from './purchase-order-errors.js';
import { createPurchaseOrderWithin, savePurchaseOrderDraftWithin } from './purchase-order-service.js';

type SeedGroup = {
  lines: { partId: UUID; quantity: number; unitPrice: number }[];
  supplierName: string;
};

/**
 * Turns a ticked selection into drafts, one per Supplier (spec §4).
 *
 * The selection is supplier-blind on purpose: procurement ticks what the shop is short of, and the
 * split into orders is arithmetic nobody should have to do by hand. Seeded from a Job, every draft
 * links back to it, so the PDF reaches that Job's documents tab whichever Supplier it went to.
 *
 * Lines are seeded **unpriced**. The buy list is quantity-only by the cost gate (spec §11), so the
 * price is keyed on the draft afterwards by someone who may read costs — a zero here means "not
 * priced yet", and marking the order sent is what asserts the price was agreed.
 *
 * One transaction covers every draft: a selection spanning three Suppliers either becomes three
 * drafts or none, never a partial set the buyer has to reconcile against what they ticked.
 */
export async function seedPurchaseOrderDrafts({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PurchaseOrderSeedInput;
}): Promise<PurchaseOrderSeedResult> {
  const groups = await groupSelectionBySupplier({ db, input });

  return db.transaction(async (tx) => {
    const created: PurchaseOrderSeedResult['purchaseOrders'] = [];

    for (const [supplierId, group] of groups) {
      // Supplier existence (and retirement) is the create's own check, taken under its row lock.
      const draft = await createPurchaseOrderWithin({
        actorUserId,
        db: tx,
        input: { expectedDeliveryDate: null, supplierId },
      });
      const saved = await savePurchaseOrderDraftWithin({
        actorUserId,
        db: tx,
        input: {
          expectedDeliveryDate: null,
          id: draft.id,
          jobIds: input.jobId === null ? [] : [input.jobId],
          lines: group.lines,
          supplierId,
        },
      });

      created.push({ code: saved.code, id: saved.id, supplierName: group.supplierName });
    }

    return PurchaseOrderSeedResultSchema.parse({ purchaseOrders: created });
  });
}

/**
 * The whole selection judged before a single draft exists, so an unpurchasable Part fails the
 * request rather than the third order in it. Groups come out ordered by Supplier name, which is the
 * order the buyer is told about them in.
 */
async function groupSelectionBySupplier({
  db,
  input,
}: {
  db: Db;
  input: PurchaseOrderSeedInput;
}): Promise<Array<[UUID, SeedGroup]>> {
  const partRows = await db
    .select({
      id: parts.id,
      supplierId: parts.supplierId,
      supplierName: supplier.companyName,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .leftJoin(supplier, eq(supplier.id, parts.supplierId))
    .where(
      inArray(
        parts.id,
        input.lines.map((line) => line.partId),
      ),
    );
  const partsById = new Map(partRows.map((row) => [row.id, row]));
  const bySupplier = new Map<UUID, SeedGroup>();

  for (const line of input.lines) {
    const part = partsById.get(line.partId);
    if (!part) throw new PurchaseOrderPartNotFoundError(line.partId);
    // A Built Part is made in-house; it can carry a shortfall on the buy list but never a PO line.
    if (part.supplierId === null || part.supplierName === null) {
      throw new PurchaseOrderPartNotPurchasableError(line.partId);
    }
    if (!isWholeUnitQuantity(line.quantity, unitClassFor(part.unitOfMeasure))) {
      throw new PurchaseOrderInvalidQuantityError(line.partId);
    }

    const group = bySupplier.get(part.supplierId) ?? { lines: [], supplierName: part.supplierName };
    group.lines.push({ partId: line.partId, quantity: line.quantity, unitPrice: 0 });
    bySupplier.set(part.supplierId, group);
  }

  return [...bySupplier].sort(([, left], [, right]) => left.supplierName.localeCompare(right.supplierName));
}
