import type { DatabaseTransaction, Db } from '@pkg/db';
import {
  assemblyParts,
  invoiceFlagResolutions,
  jobCfoAssemblies,
  jobCfoParts,
  jobEstimateSnapshots,
  jobs,
  partBom,
  parts,
  productAssemblies,
  productMaterialLines,
  products,
  purchaseOrderAmendments,
  purchaseOrderLines,
  purchaseOrders,
  stockBuilds,
  stockMovements,
  stocktakeSessions,
} from '@pkg/db/equipment';
import { deriveMovingAverage } from '@pkg/domain/equipment';
import type { AuthId, UUID } from '@pkg/schema';
import {
  formatJobCode,
  formatPurchaseOrderCode,
  type Part,
  type PartMergeBlocker,
  type PartMergeInput,
  type PartMergeMovedCounts,
  type PartMergePreview,
  type PartMergeSide,
  type PartMergeSummedLine,
  STOCKTAKE_SCOPE_TRACKING_MODE,
  type StocktakeScope,
} from '@pkg/schema/equipment';
import { type AnyColumn, and, asc, countDistinct, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import { diffAuditUpdate, recordAuditEvent, recordAuditUpdate } from '../../audit/audit-writer.js';
import { scaleUnitCost } from '../inventory/ledger.js';
import { PartMergeBlockedError, PartMergeSelfError, PartNotFoundError } from './part-errors.js';
import { getPart, partAuditDescriptor } from './part-service.js';

type PartRow = typeof parts.$inferSelect;
type Pair = { source: PartRow; target: PartRow };

/** Descriptive fields a survivor left empty and takes from the duplicate; identity fields never move. */
const FILL_EMPTY_FIELDS = ['description', 'drawingCode', 'finish', 'minimumStock', 'storageLocation'] as const;

/**
 * Records that list Parts with a quantity, keyed by the parent that lists them. When a parent lists
 * both Parts, the merge adds the duplicate's quantity to the survivor's line instead of refusing.
 */
const SUMMED_TABLES = [
  { group: 'parent_part_id', part: 'component_part_id', quantity: 'quantity', table: partBom },
  { group: 'assembly_id', part: 'part_id', quantity: 'quantity', table: assemblyParts },
  { group: 'product_id', part: 'part_id', quantity: 'quantity_per_unit', table: productMaterialLines },
  { group: 'cfo_assembly_id', part: 'part_id', quantity: 'quantity', table: jobCfoParts },
] as const;

export async function getPartMergePreview({ db, input }: { db: Db; input: PartMergeInput }): Promise<PartMergePreview> {
  if (input.sourceId === input.targetId) throw new PartMergeSelfError(input.sourceId);

  const pair = await loadPair(db, input);
  const [blockers, plan, ledger] = await Promise.all([
    findBlockers(db, pair),
    loadMergePlan(db, pair),
    loadLedgerFacts(db, pair),
  ]);

  return {
    blockers,
    combinedAverageUnitCost: scaleUnitCost(ledger.combinedAverage, pair.target.standardPurchaseLengthMm),
    combinedOnHand: ledger.source.onHand + ledger.target.onHand,
    droppedBomLineCount: plan.droppedBomLineCount,
    moved: plan.moved,
    source: ledger.source,
    summed: plan.summed,
    target: ledger.target,
    unitOfMeasure: pair.target.unitOfMeasure,
  };
}

/**
 * One duplicate into one survivor: every record naming the duplicate — its ledger included — is
 * re-pointed at the survivor, and the duplicate is deleted so its code is free again. Rewriting
 * `stock_movement.part_id` is the one sanctioned edit of the ledger (ADR 0020): only the Part a row
 * names changes, never its quantity or cost, because the two Parts were always one physical item.
 */
export async function mergePart({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: PartMergeInput;
}): Promise<Part> {
  const { sourceId, targetId } = input;
  if (sourceId === targetId) throw new PartMergeSelfError(sourceId);

  return db.transaction(async (tx) => {
    // Draft saves and receipts lock the order before its line Parts, so take the order locks first.
    await tx
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        inArray(
          purchaseOrders.id,
          tx
            .select({ id: purchaseOrderLines.purchaseOrderId })
            .from(purchaseOrderLines)
            .where(inArray(purchaseOrderLines.partId, [sourceId, targetId])),
        ),
      )
      .orderBy(purchaseOrders.id)
      .for('update');
    // Every ledger writer locks its Parts in id order; one statement keeps the merge in that order too.
    const rows = await tx
      .select()
      .from(parts)
      .where(inArray(parts.id, [sourceId, targetId]))
      .orderBy(asc(parts.id))
      .for('update');
    const pair = findPair(rows, input);

    const blockers = await findBlockers(tx, pair);
    if (blockers.length > 0) throw new PartMergeBlockedError(blockers);

    const [{ moved }, ledger] = await Promise.all([loadMergePlan(tx, pair), loadLedgerFacts(tx, pair)]);

    // The ledger's receipt rows reference their order line through `(purchase_order_id, part_id)`.
    // Both sides move in one statement so the non-deferrable key is only checked once they agree; a
    // survivor line on the same order cannot exist, because that pair is refused above.
    await tx.execute(sql`
      WITH moved_lines AS (
        UPDATE ${purchaseOrderLines} SET part_id = ${targetId} WHERE part_id = ${sourceId} RETURNING id
      )
      UPDATE ${stockMovements} SET part_id = ${targetId} WHERE part_id = ${sourceId}
    `);
    await tx.update(stockBuilds).set({ builtPartId: targetId }).where(eq(stockBuilds.builtPartId, sourceId));
    await tx
      .update(purchaseOrderAmendments)
      .set({ partId: targetId })
      .where(eq(purchaseOrderAmendments.partId, sourceId));
    await tx
      .update(purchaseOrderAmendments)
      .set({ newPartId: targetId })
      .where(eq(purchaseOrderAmendments.newPartId, sourceId));

    // The survivor keeps its own recipe, even an empty one: an empty BOM is a real, trivial build.
    await tx.delete(partBom).where(eq(partBom.parentPartId, sourceId));
    for (const summed of SUMMED_TABLES) await sumAndRepoint(tx, summed, pair);

    // Two references carry the Part id without a key. Only the id changes; a snapshot keeps its
    // quantities and costs, and a flag key cannot collide because both Parts never share an order.
    await tx
      .update(jobEstimateSnapshots)
      .set({
        payload: sql`replace(${jobEstimateSnapshots.payload}::text, ${sourceId}::text, ${targetId}::text)::jsonb`,
      })
      .where(sql`${jobEstimateSnapshots.payload}::text LIKE ${`%${sourceId}%`}`);
    await tx
      .update(invoiceFlagResolutions)
      .set({
        flagKey: sql`left(${invoiceFlagResolutions.flagKey}, length(${invoiceFlagResolutions.flagKey}) - ${sourceId.length}) || ${targetId}::text`,
      })
      .where(sql`${invoiceFlagResolutions.flagKey} LIKE ${`%:${sourceId}`}`);

    // The merged ledger replays the two histories as one; a revaluation at its end restores the
    // stock value the two Parts held apart. It is appended, like every revaluation.
    if (ledger.combinedAverage !== null && !sameCost(ledger.combinedAverage, ledger.replayedAverage)) {
      await tx.insert(stockMovements).values({
        actorUserId,
        delta: 0,
        movementType: 'revaluation',
        note: `Part Merge kept the stock value of ${pair.source.code} and ${pair.target.code}`,
        partId: targetId,
        unitCost: ledger.combinedAverage,
      });
    }

    const merged = await fillEmptyFields(tx, pair, actorUserId);
    await tx.delete(parts).where(eq(parts.id, sourceId));
    await recordMergeEvents(tx, { actorUserId, merged, moved, pair });

    return getPart({ db: tx, id: targetId });
  });
}

async function loadPair(db: Db | DatabaseTransaction, input: PartMergeInput): Promise<Pair> {
  const rows = await db
    .select()
    .from(parts)
    .where(inArray(parts.id, [input.sourceId, input.targetId]));

  return findPair(rows, input);
}

function findPair(rows: readonly PartRow[], { sourceId, targetId }: PartMergeInput): Pair {
  const source = rows.find((row) => row.id === sourceId);
  const target = rows.find((row) => row.id === targetId);
  if (!source) throw new PartNotFoundError(sourceId);
  if (!target) throw new PartNotFoundError(targetId);

  return { source, target };
}

async function findBlockers(db: Db | DatabaseTransaction, { source, target }: Pair): Promise<PartMergeBlocker[]> {
  const blockers: PartMergeBlocker[] = [];
  if (source.unitOfMeasure !== target.unitOfMeasure) blockers.push({ kind: 'unit-of-measure' });
  if (source.standardPurchaseLengthMm !== target.standardPurchaseLengthMm) {
    blockers.push({ kind: 'standard-purchase-length' });
  }
  if (source.stockTrackingMode !== target.stockTrackingMode) blockers.push({ kind: 'stock-tracking-mode' });
  if (source.isInternallyFabricated !== target.isInternallyFabricated) blockers.push({ kind: 'built-part' });

  const [openOrderCodes, sharedOrderCodes, bomLinked, openScopes] = await Promise.all([
    target.supplierId === null ? [] : loadOpenOrdersFromOtherSuppliers(db, source.id, target.supplierId),
    loadSharedOrderCodes(db, source.id, target.id),
    reaches(db, source.id, target.id).then(async (linked) => linked || reaches(db, target.id, source.id)),
    loadOpenStocktakeScopes(db, [source.stockTrackingMode, target.stockTrackingMode]),
  ]);

  if (openOrderCodes.length > 0) blockers.push({ kind: 'open-order-supplier', purchaseOrderCodes: openOrderCodes });
  if (sharedOrderCodes.length > 0) {
    blockers.push({ kind: 'same-purchase-order', purchaseOrderCodes: sharedOrderCodes });
  }
  if (bomLinked) blockers.push({ kind: 'bom-link' });
  for (const scope of openScopes) blockers.push({ kind: 'open-stocktake', scope });

  return blockers;
}

/** Drafts and approved orders still get saved; a line whose Part left the order's Supplier would stop saving. */
async function loadOpenOrdersFromOtherSuppliers(
  db: Db | DatabaseTransaction,
  sourceId: UUID,
  targetSupplierId: UUID,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ code: purchaseOrders.code })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
    .where(
      and(
        eq(purchaseOrderLines.partId, sourceId),
        inArray(purchaseOrders.status, ['draft', 'approved']),
        ne(purchaseOrders.supplierId, targetSupplierId),
      ),
    )
    .orderBy(purchaseOrders.code);

  return rows.map((row) => formatPurchaseOrderCode(row.code));
}

async function loadSharedOrderCodes(db: Db | DatabaseTransaction, sourceId: UUID, targetId: UUID): Promise<string[]> {
  const rows = await db
    .select({ code: purchaseOrders.code })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
    .where(inArray(purchaseOrderLines.partId, [sourceId, targetId]))
    .groupBy(purchaseOrders.id, purchaseOrders.code)
    .having(sql`count(distinct ${purchaseOrderLines.partId}) = 2`)
    .orderBy(purchaseOrders.code);

  return rows.map((row) => formatPurchaseOrderCode(row.code));
}

/** Whether `to` sits anywhere beneath `from` in the BOM graph; merging such a pair would nest a Part in itself. */
async function reaches(db: Db | DatabaseTransaction, from: UUID, to: UUID): Promise<boolean> {
  const result = await db.execute<{ reached: boolean }>(sql`
    WITH RECURSIVE beneath(part_id) AS (
      SELECT component_part_id FROM ${partBom} WHERE parent_part_id = ${from}
      UNION
      SELECT bom.component_part_id FROM ${partBom} AS bom JOIN beneath ON bom.parent_part_id = beneath.part_id
    )
    SELECT EXISTS (SELECT 1 FROM beneath WHERE part_id = ${to}) AS reached
  `);

  return result[0]?.reached === true;
}

async function loadOpenStocktakeScopes(
  db: Db | DatabaseTransaction,
  modes: readonly PartRow['stockTrackingMode'][],
): Promise<StocktakeScope[]> {
  const scopes = (Object.keys(STOCKTAKE_SCOPE_TRACKING_MODE) as StocktakeScope[]).filter((scope) =>
    modes.includes(STOCKTAKE_SCOPE_TRACKING_MODE[scope]),
  );
  const rows = await db
    .select({ scope: stocktakeSessions.scope })
    .from(stocktakeSessions)
    .where(and(inArray(stocktakeSessions.scope, scopes), isNull(stocktakeSessions.closedAt)))
    .orderBy(stocktakeSessions.scope);

  return rows.map((row) => row.scope);
}

async function loadMergePlan(
  db: Db | DatabaseTransaction,
  { source, target }: Pair,
): Promise<{ droppedBomLineCount: number; moved: PartMergeMovedCounts; summed: PartMergeSummedLine[] }> {
  const [
    stockMovementCount,
    purchaseOrderLineCount,
    componentLineCount,
    recipeLineCount,
    assemblyLineCount,
    materialLineCount,
    jobCount,
    summed,
  ] = await Promise.all([
    db.$count(stockMovements, eq(stockMovements.partId, source.id)),
    db.$count(purchaseOrderLines, eq(purchaseOrderLines.partId, source.id)),
    db.$count(partBom, eq(partBom.componentPartId, source.id)),
    db.$count(partBom, eq(partBom.parentPartId, source.id)),
    db.$count(assemblyParts, eq(assemblyParts.partId, source.id)),
    db.$count(productMaterialLines, eq(productMaterialLines.partId, source.id)),
    countJobs(db, source.id),
    loadSummedLines(db, source.id, target.id),
  ]);

  return {
    droppedBomLineCount: recipeLineCount,
    moved: {
      bomLines: componentLineCount,
      jobs: jobCount,
      productLines: assemblyLineCount + materialLineCount,
      purchaseOrderLines: purchaseOrderLineCount,
      stockMovements: stockMovementCount,
    },
    summed,
  };
}

/** Jobs whose frozen BOM or estimate names the duplicate. */
async function countJobs(db: Db | DatabaseTransaction, sourceId: UUID): Promise<number> {
  const [row] = await db
    .select({ value: countDistinct(jobs.id) })
    .from(jobs)
    .where(
      or(
        inArray(
          jobs.id,
          db
            .select({ id: jobCfoAssemblies.jobId })
            .from(jobCfoParts)
            .innerJoin(jobCfoAssemblies, eq(jobCfoAssemblies.id, jobCfoParts.cfoAssemblyId))
            .where(eq(jobCfoParts.partId, sourceId)),
        ),
        inArray(
          jobs.id,
          db
            .select({ id: jobEstimateSnapshots.jobId })
            .from(jobEstimateSnapshots)
            .where(sql`${jobEstimateSnapshots.payload}::text LIKE ${`%${sourceId}%`}`),
        ),
      ),
    );

  return row?.value ?? 0;
}

async function loadSummedLines(
  db: Db | DatabaseTransaction,
  sourceId: UUID,
  targetId: UUID,
): Promise<PartMergeSummedLine[]> {
  const pair = [sourceId, targetId];
  const both = (partColumn: AnyColumn) => sql`count(distinct ${partColumn}) = 2`;

  const [bomParents, assemblies, materialProducts, cfoJobs] = await Promise.all([
    db
      .select({ code: parts.code })
      .from(partBom)
      .innerJoin(parts, eq(parts.id, partBom.parentPartId))
      .where(inArray(partBom.componentPartId, pair))
      .groupBy(parts.id, parts.code)
      .having(both(partBom.componentPartId))
      .orderBy(parts.code),
    db
      .select({ assemblyName: productAssemblies.name, productName: products.name })
      .from(assemblyParts)
      .innerJoin(productAssemblies, eq(productAssemblies.id, assemblyParts.assemblyId))
      .innerJoin(products, eq(products.id, productAssemblies.productId))
      .where(inArray(assemblyParts.partId, pair))
      .groupBy(productAssemblies.id, productAssemblies.name, products.name)
      .having(both(assemblyParts.partId))
      .orderBy(products.name, productAssemblies.name),
    db
      .select({ name: products.name })
      .from(productMaterialLines)
      .innerJoin(products, eq(products.id, productMaterialLines.productId))
      .where(inArray(productMaterialLines.partId, pair))
      .groupBy(products.id, products.name)
      .having(both(productMaterialLines.partId))
      .orderBy(products.name),
    db
      .selectDistinct({ code: jobs.code })
      .from(jobCfoParts)
      .innerJoin(jobCfoAssemblies, eq(jobCfoAssemblies.id, jobCfoParts.cfoAssemblyId))
      .innerJoin(jobs, eq(jobs.id, jobCfoAssemblies.jobId))
      .where(
        inArray(
          jobCfoParts.cfoAssemblyId,
          db
            .select({ id: jobCfoParts.cfoAssemblyId })
            .from(jobCfoParts)
            .where(inArray(jobCfoParts.partId, pair))
            .groupBy(jobCfoParts.cfoAssemblyId)
            .having(both(jobCfoParts.partId)),
        ),
      )
      .orderBy(jobs.code),
  ]);

  return [
    ...bomParents.map((row) => ({ kind: 'bom' as const, label: row.code })),
    ...assemblies.map((row) => ({ kind: 'assembly' as const, label: `${row.productName} · ${row.assemblyName}` })),
    ...materialProducts.map((row) => ({ kind: 'product' as const, label: row.name })),
    ...cfoJobs.map((row) => ({ kind: 'job' as const, label: formatJobCode(row.code) })),
  ];
}

type LedgerFacts = {
  /** Per basis unit (a millimetre for linear stock): what the survivor's average must be to keep both Parts' stock value. */
  combinedAverage: number | null;
  /** Per basis unit: what replaying both ledgers as one would make the average. */
  replayedAverage: number | null;
  source: PartMergeSide;
  target: PartMergeSide;
};

async function loadLedgerFacts(db: Db | DatabaseTransaction, { source, target }: Pair): Promise<LedgerFacts> {
  const rows = await db
    .select({
      delta: stockMovements.delta,
      lengthMm: stockMovements.lengthMm,
      movementType: stockMovements.movementType,
      partId: stockMovements.partId,
      reason: stockMovements.reason,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .where(inArray(stockMovements.partId, [source.id, target.id]))
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));

  const facts = (part: PartRow) => {
    const ledger = rows.filter((row) => row.partId === part.id);
    const quantityRows = ledger.filter((row) => row.movementType !== 'revaluation');
    return {
      average: deriveMovingAverage(ledger),
      basisOnHand: Math.max(
        0,
        quantityRows.reduce((total, row) => total + row.delta * (row.lengthMm ?? 1), 0),
      ),
      side: {
        averageUnitCost: scaleUnitCost(deriveMovingAverage(ledger), part.standardPurchaseLengthMm),
        code: part.code,
        id: part.id,
        name: part.name,
        onHand: quantityRows.reduce((total, row) => total + row.delta, 0),
      },
    };
  };
  const sourceFacts = facts(source);
  const targetFacts = facts(target);
  const replayedAverage = deriveMovingAverage(rows);

  return {
    combinedAverage: combineAverages(sourceFacts, targetFacts) ?? replayedAverage,
    replayedAverage,
    source: sourceFacts.side,
    target: targetFacts.side,
  };
}

/**
 * Each ledger drew at its own average until now, so the value each holds is its stock at that
 * average. Replaying the two as one would re-price those past draws and move value that has
 * already left; weighting the two averages by what is on the shelf keeps it. Null when nothing is
 * on either shelf, where the replay has no value to disturb.
 */
function combineAverages(
  source: { average: number | null; basisOnHand: number },
  target: { average: number | null; basisOnHand: number },
): number | null {
  if (source.average === null) return target.average;
  if (target.average === null) return source.average;
  const onHand = source.basisOnHand + target.basisOnHand;
  if (onHand === 0) return null;

  return (source.basisOnHand * source.average + target.basisOnHand * target.average) / onHand;
}

/**
 * Adds the duplicate's quantity onto the survivor's line wherever one parent lists both, drops the
 * duplicate's now-counted line, then re-points the rest. Raw SQL because the three steps are one
 * shape over four tables that differ only in their column names.
 */
async function sumAndRepoint(
  tx: DatabaseTransaction,
  { group, part, quantity, table }: (typeof SUMMED_TABLES)[number],
  { source, target }: Pair,
): Promise<void> {
  const groupColumn = sql.identifier(group);
  const partColumn = sql.identifier(part);
  const quantityColumn = sql.identifier(quantity);

  await tx.execute(sql`
    UPDATE ${table} AS survivor
    SET ${quantityColumn} = survivor.${quantityColumn} + duplicate.${quantityColumn}
    FROM ${table} AS duplicate
    WHERE survivor.${partColumn} = ${target.id}
      AND duplicate.${partColumn} = ${source.id}
      AND survivor.${groupColumn} = duplicate.${groupColumn}
  `);
  await tx.execute(sql`
    DELETE FROM ${table}
    WHERE ${partColumn} = ${source.id}
      AND ${groupColumn} IN (SELECT ${groupColumn} FROM ${table} WHERE ${partColumn} = ${target.id})
  `);
  await tx.execute(sql`UPDATE ${table} SET ${partColumn} = ${target.id} WHERE ${partColumn} = ${source.id}`);
}

async function fillEmptyFields(tx: DatabaseTransaction, { source, target }: Pair, actorUserId: AuthId) {
  const fillPatch: Partial<PartRow> = {};
  for (const field of FILL_EMPTY_FIELDS) {
    if (isEmptyPartField(target[field]) && !isEmptyPartField(source[field])) {
      Object.assign(fillPatch, { [field]: source[field] });
    }
  }
  if (Object.keys(fillPatch).length === 0) return target;

  const [updated] = await tx.update(parts).set(fillPatch).where(eq(parts.id, target.id)).returning();
  if (!updated) throw new Error('Part merge fill update did not return a row');

  const changes = diffAuditUpdate(partAuditDescriptor, target, updated);
  if (changes) {
    await recordAuditUpdate({ db: tx, descriptor: partAuditDescriptor, actorUserId, after: updated, changes });
  }

  return updated;
}

function sameCost(left: number, right: number | null): boolean {
  return right !== null && Math.abs(left - right) < 1e-6;
}

function isEmptyPartField(value: string | number | null): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

async function recordMergeEvents(
  tx: DatabaseTransaction,
  {
    actorUserId,
    merged,
    moved,
    pair: { source, target },
  }: { actorUserId: AuthId; merged: PartRow; moved: PartMergeMovedCounts; pair: Pair },
): Promise<void> {
  const sourceLabel = partLabel(source);
  const targetLabel = partLabel(target);
  const counts = {
    movedBomLines: { from: null, to: moved.bomLines },
    movedJobs: { from: null, to: moved.jobs },
    movedProductLines: { from: null, to: moved.productLines },
    movedPurchaseOrderLines: { from: null, to: moved.purchaseOrderLines },
    movedStockMovements: { from: null, to: moved.stockMovements },
  };

  await recordAuditEvent({
    db: tx,
    descriptor: partAuditDescriptor,
    action: 'merged',
    actorUserId,
    entityId: source.id,
    changes: { mergedIntoPart: { from: sourceLabel, to: targetLabel }, ...counts },
    record: partAuditDescriptor.toRecord(source),
    summary: `Merged part '${sourceLabel}' into '${targetLabel}'`,
  });
  await recordAuditEvent({
    db: tx,
    descriptor: partAuditDescriptor,
    action: 'merged',
    actorUserId,
    entityId: target.id,
    changes: { absorbedPart: { from: sourceLabel, to: targetLabel }, ...counts },
    record: partAuditDescriptor.toRecord(merged),
    summary: `Absorbed part '${sourceLabel}' (${moved.stockMovements} stock movements, ${moved.purchaseOrderLines} purchase order lines)`,
  });
}

function partLabel(part: Pick<PartRow, 'code' | 'name'>): string {
  return `${part.code} (${part.name})`;
}
