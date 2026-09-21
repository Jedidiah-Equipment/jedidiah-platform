import type { Db } from '@pkg/db';
import { user } from '@pkg/db';
import { purchaseOrderLineArrivals, purchaseOrderLines } from '@pkg/db/equipment';
import { deriveMovementWarnings, derivePurchaseOrderActions } from '@pkg/domain/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import {
  type PostArrivalInput,
  type PostArrivalResult,
  PostArrivalResult as PostArrivalResultSchema,
  type PurchaseOrderArrivalListResult,
  PurchaseOrderArrivalListResult as PurchaseOrderArrivalListResultSchema,
} from '@pkg/schema/equipment';
import { and, desc, eq, sql } from 'drizzle-orm';

import {
  assertPurchaseOrderAction,
  PurchaseOrderArrivalBelowZeroError,
  PurchaseOrderLineNotCustomError,
  PurchaseOrderLineNotFoundError,
} from './purchase-order-errors.js';
import { loadPurchaseOrderActionFacts, lockPurchaseOrder, type PurchaseOrderDb } from './purchase-order-service.js';

export async function postArrival({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PostArrivalInput;
}): Promise<PostArrivalResult> {
  return db.transaction(async (tx) => {
    const row = await lockPurchaseOrder(tx, input.purchaseOrderId);
    const actions = derivePurchaseOrderActions(await loadPurchaseOrderActionFacts({ db: tx, row }));
    assertPurchaseOrderAction(input.quantity > 0 ? actions.receive : actions.returnToSupplier, row.id);

    const [line] = await tx
      .select({
        customDescription: purchaseOrderLines.customDescription,
        id: purchaseOrderLines.id,
        partId: purchaseOrderLines.partId,
        quantity: purchaseOrderLines.quantity,
      })
      .from(purchaseOrderLines)
      .where(and(eq(purchaseOrderLines.id, input.lineId), eq(purchaseOrderLines.purchaseOrderId, row.id)));
    if (!line) throw new PurchaseOrderLineNotFoundError(row.id, input.lineId);
    if (line.partId !== null) throw new PurchaseOrderLineNotCustomError(line.id);
    if (!line.customDescription) throw new Error('Custom Line has no description');

    const arrivedQuantity = await loadLineArrivedQuantity({ db: tx, lineId: line.id, purchaseOrderId: row.id });
    if (arrivedQuantity + input.quantity < -0.000001) {
      throw new PurchaseOrderArrivalBelowZeroError(line.customDescription, arrivedQuantity);
    }

    const [arrival] = await tx
      .insert(purchaseOrderLineArrivals)
      .values({
        actorUserId,
        lineId: line.id,
        note: input.note,
        purchaseOrderId: row.id,
        quantity: input.quantity,
      })
      .returning();
    if (!arrival) throw new Error('Arrival insert did not return a row');
    const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actorUserId));

    return PostArrivalResultSchema.parse({
      arrival: {
        actorName: actor?.name ?? null,
        actorUserId: arrival.actorUserId,
        createdAt: arrival.createdAt,
        id: arrival.id,
        lineDescription: line.customDescription,
        lineId: line.id,
        note: arrival.note,
        quantity: arrival.quantity,
      },
      warnings:
        input.quantity > 0
          ? deriveMovementWarnings({
              facts: { kind: 'receipt', orderedQuantity: line.quantity, receivedQuantity: arrivedQuantity },
              quantity: input.quantity,
            })
          : [],
    });
  });
}

async function loadLineArrivedQuantity({
  db,
  lineId,
  purchaseOrderId,
}: {
  db: PurchaseOrderDb;
  lineId: UUID;
  purchaseOrderId: UUID;
}): Promise<number> {
  const [row] = await db
    .select({ quantity: sql<number>`coalesce(sum(${purchaseOrderLineArrivals.quantity}), 0)::double precision` })
    .from(purchaseOrderLineArrivals)
    .where(
      and(eq(purchaseOrderLineArrivals.purchaseOrderId, purchaseOrderId), eq(purchaseOrderLineArrivals.lineId, lineId)),
    );
  return row?.quantity ?? 0;
}

export async function listPurchaseOrderArrivals({
  db,
  purchaseOrderId,
}: {
  db: Db;
  purchaseOrderId: UUID;
}): Promise<PurchaseOrderArrivalListResult> {
  const rows = await db
    .select({
      actorName: user.name,
      actorUserId: purchaseOrderLineArrivals.actorUserId,
      createdAt: purchaseOrderLineArrivals.createdAt,
      id: purchaseOrderLineArrivals.id,
      lineDescription: purchaseOrderLines.customDescription,
      lineId: purchaseOrderLineArrivals.lineId,
      note: purchaseOrderLineArrivals.note,
      quantity: purchaseOrderLineArrivals.quantity,
    })
    .from(purchaseOrderLineArrivals)
    .innerJoin(purchaseOrderLines, eq(purchaseOrderLines.id, purchaseOrderLineArrivals.lineId))
    .innerJoin(user, eq(user.id, purchaseOrderLineArrivals.actorUserId))
    .where(eq(purchaseOrderLineArrivals.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(purchaseOrderLineArrivals.createdAt), desc(purchaseOrderLineArrivals.id));

  return PurchaseOrderArrivalListResultSchema.parse({ items: rows });
}
