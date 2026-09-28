import { auditEvents, createDatabaseClient, type Db } from '@pkg/db';
import {
  assemblyParts,
  documents,
  invoiceFlagResolutions,
  jobCfoParts,
  jobEstimateSnapshots,
  partBom,
  parts,
  productAssemblies,
  productMaterialLines,
  purchaseOrderAmendments,
  purchaseOrderLines,
  purchaseOrders,
  stockMovements,
  stocktakeSessions,
  supplier,
} from '@pkg/db/equipment';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { loadBucketQuantities, loadMovingAverages } from '../inventory/ledger.js';
import {
  actorUserId,
  estimateSnapshot,
  seedProductUnit,
  seedSentPurchaseOrder,
  test,
} from '../test/inventory-fixtures.js';
import { PartMergeBlockedError, PartMergeSelfError, PartNotFoundError } from './part-errors.js';
import { getPartMergePreview, mergePart } from './part-merge-service.js';

type SeededPart = typeof parts.$inferSelect;

async function seedDuplicate(
  db: Db,
  survivor: SeededPart,
  overrides: Partial<typeof parts.$inferInsert> = {},
): Promise<SeededPart> {
  const [row] = await db
    .insert(parts)
    .values({
      ...survivor,
      code: `${survivor.code}-DUP`,
      id: undefined,
      name: `${survivor.name} duplicate`,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('Duplicate Part insert did not return a row');

  return row;
}

function openingBalance(partId: string, delta: number, unitCost: number, createdAt: string) {
  return {
    actorUserId,
    createdAt: new Date(createdAt),
    delta,
    movementType: 'adjustment' as const,
    partId,
    reason: 'opening-balance' as const,
    unitCost,
  };
}

function merge(db: Db, sourceId: string, targetId: string) {
  return mergePart({ actorUserId, db, input: { sourceId, targetId } });
}

describe('mergePart', () => {
  test('moves the duplicate ledger onto the survivor, replaying both as one, and deletes the duplicate', async ({
    context,
  }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor);
    await context.db
      .insert(stockMovements)
      .values([
        openingBalance(survivor.id, 4, 10, '2026-08-03T08:00:00.000Z'),
        openingBalance(duplicate.id, 6, 20, '2026-08-04T08:00:00.000Z'),
      ]);

    await merge(context.db, duplicate.id, survivor.id);

    const onHand = await loadBucketQuantities(context.db, [survivor.id]);
    expect(onHand.get(survivor.id)?.get(null)).toBe(10);
    // 4 at R10 then 6 at R20: (40 + 120) / 10.
    await expect(loadMovingAverages(context.db, [survivor.id])).resolves.toEqual(new Map([[survivor.id, 16]]));
    await expect(context.db.$count(parts, eq(parts.id, duplicate.id))).resolves.toBe(0);
  });

  test('frees the duplicate code for a new Part', async ({ context }) => {
    const duplicate = await seedDuplicate(context.db, context.parts.piece);

    await merge(context.db, duplicate.id, context.parts.piece.id);

    await expect(seedDuplicate(context.db, context.parts.piece, { code: duplicate.code })).resolves.toMatchObject({
      code: duplicate.code,
    });
  });

  test('re-points order lines together with the receipts booked against them', async ({ context }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor);
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: duplicate.id, quantity: 5 },
    ]);
    await context.db.insert(stockMovements).values({
      actorUserId,
      delta: 5,
      movementType: 'receipt',
      partId: duplicate.id,
      purchaseOrderId,
      unitCost: 12,
    });

    await merge(context.db, duplicate.id, survivor.id);

    await expect(
      context.db.$count(
        purchaseOrderLines,
        and(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId), eq(purchaseOrderLines.partId, survivor.id)),
      ),
    ).resolves.toBe(1);
    await expect(
      context.db.$count(
        stockMovements,
        and(eq(stockMovements.purchaseOrderId, purchaseOrderId), eq(stockMovements.partId, survivor.id)),
      ),
    ).resolves.toBe(1);
  });

  test('adds quantities together where one Product, Assembly, BOM or Job lists both Parts', async ({ context }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor);
    const unit = await seedProductUnit(context.db, 'MERGE');
    const [assembly] = await context.db
      .insert(productAssemblies)
      .values({ displayOrder: 0, kind: 'standard', name: 'Chassis', productId: unit.productId })
      .returning();
    if (!assembly) throw new Error('Assembly insert did not return a row');
    await context.db.insert(assemblyParts).values([
      { assemblyId: assembly.id, partId: survivor.id, quantity: 2 },
      { assemblyId: assembly.id, partId: duplicate.id, quantity: 3 },
    ]);
    await context.db.insert(productMaterialLines).values([
      { partId: survivor.id, productId: unit.productId, quantityPerUnit: 1.5 },
      { partId: duplicate.id, productId: unit.productId, quantityPerUnit: 2 },
    ]);
    await context.db.insert(partBom).values([
      { componentPartId: survivor.id, parentPartId: context.parts.fabricated.id, quantity: 1 },
      { componentPartId: duplicate.id, parentPartId: context.parts.fabricated.id, quantity: 4 },
    ]);
    const [cfoLine] = await context.db.select().from(jobCfoParts).where(eq(jobCfoParts.partId, survivor.id)).limit(1);
    if (!cfoLine) throw new Error('Seeded CFO line missing');
    await context.db
      .insert(jobCfoParts)
      .values({ cfoAssemblyId: cfoLine.cfoAssemblyId, partId: duplicate.id, quantity: 7 });

    const preview = await getPartMergePreview({
      db: context.db,
      input: { sourceId: duplicate.id, targetId: survivor.id },
    });
    expect(preview.summed.map((line) => line.kind)).toEqual(['bom', 'assembly', 'product', 'job']);

    await merge(context.db, duplicate.id, survivor.id);

    await expect(
      context.db
        .select({ quantity: assemblyParts.quantity })
        .from(assemblyParts)
        .where(eq(assemblyParts.assemblyId, assembly.id)),
    ).resolves.toEqual([{ quantity: 5 }]);
    await expect(
      context.db
        .select({ quantity: productMaterialLines.quantityPerUnit })
        .from(productMaterialLines)
        .where(eq(productMaterialLines.productId, unit.productId)),
    ).resolves.toEqual([{ quantity: 3.5 }]);
    await expect(
      context.db
        .select({ quantity: partBom.quantity })
        .from(partBom)
        .where(eq(partBom.parentPartId, context.parts.fabricated.id)),
    ).resolves.toEqual([{ quantity: 5 }]);
    await expect(
      context.db
        .select({ quantity: jobCfoParts.quantity })
        .from(jobCfoParts)
        .where(eq(jobCfoParts.cfoAssemblyId, cfoLine.cfoAssemblyId)),
    ).resolves.toEqual([{ quantity: cfoLine.quantity + 7 }]);
  });

  test('rewrites the Part id inside Job Estimate Snapshots and invoice flag keys', async ({ context }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor);
    await context.db
      .insert(jobEstimateSnapshots)
      .values({ jobId: context.jobs.cfo.id, payload: estimateSnapshot(duplicate, 2) });
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: duplicate.id, quantity: 1 },
    ]);
    const [document] = await context.db
      .insert(documents)
      .values({
        byteSize: 1,
        contentType: 'application/pdf',
        filename: 'invoice.pdf',
        metadata: {} as never,
        ownerType: 'purchase_order',
        purchaseOrderId,
        storageKey: 'invoice',
        uploaderUserId: actorUserId,
      })
      .returning();
    if (!document) throw new Error('Document insert did not return a row');
    await context.db.insert(invoiceFlagResolutions).values([
      { actorUserId, documentId: document.id, flagKey: `price-mismatch:${duplicate.id}`, kind: 'dismissed' },
      { actorUserId, documentId: document.id, flagKey: 'unmatched-line:3', kind: 'dismissed' },
    ]);

    await merge(context.db, duplicate.id, survivor.id);

    const [snapshot] = await context.db
      .select({ payload: jobEstimateSnapshots.payload })
      .from(jobEstimateSnapshots)
      .where(eq(jobEstimateSnapshots.jobId, context.jobs.cfo.id));
    expect(snapshot?.payload.materialLines).toEqual([
      expect.objectContaining({ partCode: duplicate.code, partId: survivor.id, quantityPerUnit: 2 }),
    ]);
    const keys = await context.db
      .select({ flagKey: invoiceFlagResolutions.flagKey })
      .from(invoiceFlagResolutions)
      .orderBy(invoiceFlagResolutions.flagKey);
    expect(keys.map((row) => row.flagKey)).toEqual([`price-mismatch:${survivor.id}`, 'unmatched-line:3']);
  });

  test('keeps a substitution between the pair as history naming the survivor on both sides', async ({ context }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor);
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: survivor.id, quantity: 1 },
    ]);
    await context.db.insert(purchaseOrderAmendments).values({
      actorUserId,
      kind: 'substitute-part',
      newPartId: survivor.id,
      newQuantity: 1,
      note: 'Supplier sent the other code',
      oldQuantity: 1,
      partId: duplicate.id,
      purchaseOrderId,
    });

    await merge(context.db, duplicate.id, survivor.id);

    await expect(
      context.db
        .select({ newPartId: purchaseOrderAmendments.newPartId, partId: purchaseOrderAmendments.partId })
        .from(purchaseOrderAmendments),
    ).resolves.toEqual([{ newPartId: survivor.id, partId: survivor.id }]);
  });

  test('fills the survivor’s empty fields from the duplicate and audits both sides', async ({ context }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor, {
      drawingCode: 'DRW-7',
      minimumStock: 12,
      storageLocation: 'Bay 4',
    });
    await context.db.update(parts).set({ storageLocation: 'Rack A' }).where(eq(parts.id, survivor.id));
    await context.db.insert(stockMovements).values(openingBalance(duplicate.id, 2, 5, '2026-08-03T08:00:00.000Z'));

    await expect(merge(context.db, duplicate.id, survivor.id)).resolves.toMatchObject({
      code: survivor.code,
      drawingCode: 'DRW-7',
      minimumStock: 12,
      name: survivor.name,
      storageLocation: 'Rack A',
    });

    const events = await context.db
      .select({ changes: auditEvents.changes, entityId: auditEvents.entityId, summary: auditEvents.summary })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'merged'));
    const counts = {
      movedBomLines: { from: null, to: 0 },
      movedJobs: { from: null, to: 0 },
      movedProductLines: { from: null, to: 0 },
      movedPurchaseOrderLines: { from: null, to: 0 },
      movedStockMovements: { from: null, to: 1 },
    };
    const from = `${duplicate.code} (${duplicate.name})`;
    const to = `${survivor.code} (${survivor.name})`;
    expect(events).toEqual(
      expect.arrayContaining([
        {
          changes: { mergedIntoPart: { from, to }, ...counts },
          entityId: duplicate.id,
          summary: `Merged part '${from}' into '${to}'`,
        },
        {
          changes: { absorbedPart: { from, to }, ...counts },
          entityId: survivor.id,
          summary: `Absorbed part '${from}' (1 stock movements, 0 purchase order lines)`,
        },
      ]),
    );
  });

  test('keeps the survivor’s own BOM and drops the duplicate’s, but adopts it when the survivor has none', async ({
    context,
  }) => {
    const built = context.parts.fabricated;
    const recipeless = await seedDuplicate(context.db, built, { code: 'BUILT-EMPTY' });
    const duplicate = await seedDuplicate(context.db, built);
    await context.db.insert(partBom).values([
      { componentPartId: context.parts.piece.id, parentPartId: built.id, quantity: 2 },
      { componentPartId: context.parts.measured.id, parentPartId: duplicate.id, quantity: 3 },
    ]);

    await expect(
      getPartMergePreview({ db: context.db, input: { sourceId: duplicate.id, targetId: built.id } }),
    ).resolves.toMatchObject({ droppedBomLineCount: 1 });
    await merge(context.db, duplicate.id, built.id);
    await merge(context.db, built.id, recipeless.id);

    await expect(
      context.db.select({ componentPartId: partBom.componentPartId, parentPartId: partBom.parentPartId }).from(partBom),
    ).resolves.toEqual([{ componentPartId: context.parts.piece.id, parentPartId: recipeless.id }]);
  });

  test('refuses a merge into itself or with a missing Part', async ({ context }) => {
    const survivor = context.parts.piece;

    await expect(merge(context.db, survivor.id, survivor.id)).rejects.toBeInstanceOf(PartMergeSelfError);
    await expect(merge(context.db, '00000000-0000-4000-8000-000000000999', survivor.id)).rejects.toBeInstanceOf(
      PartNotFoundError,
    );
  });

  test('refuses Parts whose quantities mean different things, and moves nothing', async ({ context }) => {
    const survivor = context.parts.linear;
    const duplicate = await seedDuplicate(context.db, context.parts.periodic);
    await context.db.insert(stockMovements).values({
      ...openingBalance(duplicate.id, 1, 5, '2026-08-03T08:00:00.000Z'),
      lengthMm: 6_000,
    });
    await context.db.update(parts).set({ standardPurchaseLengthMm: 3_000 }).where(eq(parts.id, duplicate.id));

    await expect(merge(context.db, duplicate.id, survivor.id)).rejects.toMatchObject({
      metadata: { blockers: [{ kind: 'standard-purchase-length' }, { kind: 'stock-tracking-mode' }] },
    });
    await expect(merge(context.db, context.parts.fabricated.id, context.parts.measured.id)).rejects.toMatchObject({
      metadata: { blockers: [{ kind: 'unit-of-measure' }, { kind: 'built-part' }] },
    });
    await expect(context.db.$count(stockMovements, eq(stockMovements.partId, duplicate.id))).resolves.toBe(1);
  });

  test('refuses while both Parts share an order, or the duplicate is on an open order from another Supplier', async ({
    context,
  }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor);
    await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: survivor.id, quantity: 1 },
      { partId: duplicate.id, quantity: 1 },
    ]);
    const [otherSupplier] = await context.db
      .insert(supplier)
      .values({ companyName: 'Other Supplier' })
      .returning({ id: supplier.id });
    if (!otherSupplier) throw new Error('Supplier insert did not return a row');
    const otherDuplicate = await seedDuplicate(context.db, survivor, {
      code: 'PIECE-OTHER',
      supplierId: otherSupplier.id,
    });
    await seedSentPurchaseOrder(context.db, otherSupplier.id, [{ partId: otherDuplicate.id, quantity: 1 }], {
      status: 'draft',
    });
    const approvedId = await seedSentPurchaseOrder(
      context.db,
      otherSupplier.id,
      [{ partId: otherDuplicate.id, quantity: 1 }],
      { status: 'draft' },
    );
    await context.db
      .update(purchaseOrders)
      .set({ approvedAt: new Date(), status: 'approved' })
      .where(eq(purchaseOrders.id, approvedId));
    await seedSentPurchaseOrder(context.db, otherSupplier.id, [{ partId: otherDuplicate.id, quantity: 1 }]);

    const sameOrder = await merge(context.db, duplicate.id, survivor.id).catch((error: unknown) => error);
    expect(sameOrder).toBeInstanceOf(PartMergeBlockedError);
    expect(sameOrder).toMatchObject({
      metadata: { blockers: [{ kind: 'same-purchase-order', purchaseOrderCodes: [expect.stringMatching(/^PO-/)] }] },
    });
    // The draft and the approved order block; the sent order is history and would follow the Part.
    await expect(merge(context.db, otherDuplicate.id, survivor.id)).rejects.toMatchObject({
      metadata: {
        blockers: [
          {
            kind: 'open-order-supplier',
            purchaseOrderCodes: [expect.stringMatching(/^PO-/), expect.stringMatching(/^PO-/)],
          },
        ],
      },
    });
  });

  test('refuses a pair where one Part sits beneath the other in a BOM', async ({ context }) => {
    const built = context.parts.fabricated;
    const middle = await seedDuplicate(context.db, built, { code: 'MIDDLE' });
    const duplicate = await seedDuplicate(context.db, built);
    await context.db.insert(partBom).values([
      { componentPartId: middle.id, parentPartId: built.id, quantity: 1 },
      { componentPartId: duplicate.id, parentPartId: middle.id, quantity: 1 },
    ]);

    await expect(merge(context.db, duplicate.id, built.id)).rejects.toMatchObject({
      metadata: { blockers: [{ kind: 'bom-link' }] },
    });
    await expect(merge(context.db, built.id, duplicate.id)).rejects.toMatchObject({
      metadata: { blockers: [{ kind: 'bom-link' }] },
    });
    await expect(merge(context.db, middle.id, built.id)).rejects.toMatchObject({
      metadata: { blockers: [{ kind: 'bom-link' }] },
    });
  });

  test('waits for a ledger writer holding the duplicate, then carries its movement across', async ({ context }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor);
    const mergeClient = createDatabaseClient(context.databaseUrl, { max: 1 });
    let releaseWriter = () => {};
    const waitToPost = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    let signalPartLocked = () => {};
    const partLocked = new Promise<void>((resolve) => {
      signalPartLocked = resolve;
    });
    const writer = context.db.transaction(async (tx) => {
      await tx.select({ id: parts.id }).from(parts).where(eq(parts.id, duplicate.id)).for('update');
      signalPartLocked();
      await waitToPost;
      await tx.insert(stockMovements).values(openingBalance(duplicate.id, 3, 10, '2026-08-05T08:00:00.000Z'));
    });
    await partLocked;

    const merging = mergePart({
      actorUserId,
      db: mergeClient.db,
      input: { sourceId: duplicate.id, targetId: survivor.id },
    });
    await expect
      .poll(async () => {
        const result = await context.db.execute<{ count: number }>(sql`
          select count(*)::int as count
          from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
        `);
        return Number(result[0]?.count ?? 0);
      })
      .toBeGreaterThan(0);
    releaseWriter();

    const [writerResult, mergeResult] = await Promise.allSettled([writer, merging]);
    await mergeClient.close();
    expect(writerResult).toMatchObject({ status: 'fulfilled' });
    expect(mergeResult).toMatchObject({ status: 'fulfilled', value: { id: survivor.id } });
    const onHand = await loadBucketQuantities(context.db, [survivor.id]);
    expect(onHand.get(survivor.id)?.get(null)).toBe(3);
  });

  test('refuses while a stocktake is open for the pair’s scope', async ({ context }) => {
    const survivor = context.parts.piece;
    const duplicate = await seedDuplicate(context.db, survivor);
    await context.db.insert(stocktakeSessions).values({ openedByUserId: actorUserId, scope: 'raw-material' });

    await expect(
      getPartMergePreview({ db: context.db, input: { sourceId: duplicate.id, targetId: survivor.id } }),
    ).resolves.toMatchObject({ blockers: [] });

    await context.db.insert(stocktakeSessions).values({ openedByUserId: actorUserId, scope: 'stores' });

    await expect(merge(context.db, duplicate.id, survivor.id)).rejects.toMatchObject({
      metadata: { blockers: [{ kind: 'open-stocktake', scope: 'stores' }] },
    });
  });
});

describe('getPartMergePreview', () => {
  test('shows both Parts’ stock, the combined result and what will move', async ({ context }) => {
    const survivor = context.parts.linear;
    const duplicate = await seedDuplicate(context.db, survivor);
    await context.db.insert(stockMovements).values([
      { ...openingBalance(survivor.id, 2, 60, '2026-08-03T08:00:00.000Z'), lengthMm: 6_000 },
      { ...openingBalance(duplicate.id, 1, 120, '2026-08-04T08:00:00.000Z'), lengthMm: 6_000 },
    ]);
    await context.db
      .insert(jobEstimateSnapshots)
      .values({ jobId: context.jobs.custom.id, payload: estimateSnapshot(duplicate, 1) });

    await expect(
      getPartMergePreview({ db: context.db, input: { sourceId: duplicate.id, targetId: survivor.id } }),
    ).resolves.toEqual({
      blockers: [],
      // (2 × R60 + 1 × R120) ÷ 3 pieces, per standard 6 m length.
      combinedAverageUnitCost: 80,
      combinedOnHand: 3,
      droppedBomLineCount: 0,
      moved: { bomLines: 0, jobs: 1, productLines: 0, purchaseOrderLines: 0, stockMovements: 1 },
      source: { averageUnitCost: 120, code: duplicate.code, id: duplicate.id, name: duplicate.name, onHand: 1 },
      summed: [],
      target: { averageUnitCost: 60, code: survivor.code, id: survivor.id, name: survivor.name, onHand: 2 },
      unitOfMeasure: 'mm',
    });
  });
});
