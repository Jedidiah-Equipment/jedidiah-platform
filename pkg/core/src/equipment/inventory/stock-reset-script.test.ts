import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { auditEvents, type Db } from '@pkg/db';
import {
  creditNoteSettlements,
  documents,
  invoiceExtractions,
  invoiceFlagResolutions,
  jobStockCloseOuts,
  purchaseOrderAmendments,
  purchaseOrderJobLinks,
  purchaseOrderLineArrivals,
  purchaseOrderLines,
  purchaseOrders,
  stockBuilds,
  stockMovements,
  stocktakeSessions,
} from '@pkg/db/equipment';
import { count, eq, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect } from 'vitest';

import { actorUserId, type seedJobs, type seedParts, seedSentPurchaseOrder, test } from '../test/inventory-fixtures.js';
import { loadMovingAverages } from './ledger.js';

const scriptPath = fileURLToPath(
  new URL('../../../../db/scripts/2026-09-28-production-stock-reset.sql', import.meta.url),
);
const runPsql = promisify(execFile);
// The operator runs the script with a host psql; a machine without one has nothing to verify it with.
const hasPsql = await runPsql('psql', ['--version']).then(
  () => true,
  () => false,
);

type World = {
  jobs: Awaited<ReturnType<typeof seedJobs>>;
  parts: Awaited<ReturnType<typeof seedParts>>;
  supplierId: string;
};

/**
 * The ledger the reset meets in production, in miniature: every movement type, a linked return, an
 * invoice correction and a credit note, a build, a walked count, and a Part that never had a cost.
 */
async function seedLedger(db: Db, { jobs, parts, supplierId }: World) {
  let minute = 0;
  const movement = async (values: Omit<typeof stockMovements.$inferInsert, 'actorUserId' | 'createdAt'>) => {
    minute += 1;
    const [row] = await db
      .insert(stockMovements)
      .values({ actorUserId, createdAt: new Date(Date.UTC(2026, 7, 10, 8, minute)), ...values })
      .returning({ id: stockMovements.id });
    if (!row) throw new Error('Stock movement insert did not return a row');
    return row.id;
  };

  const orderId = await seedSentPurchaseOrder(db, supplierId, [
    { partId: parts.piece.id, quantity: 5, unitPrice: 8 },
    { partId: parts.linear.id, quantity: 2, unitPrice: 120 },
    { partId: parts.measured.id, quantity: 4, unitPrice: 12.5 },
  ]);
  await seedSentPurchaseOrder(db, supplierId, [{ partId: parts.piece.id, quantity: 1 }], { status: 'draft' });

  const [customLine] = await db
    .insert(purchaseOrderLines)
    .values({
      customDescription: 'Galvanising',
      customUnit: 'lot',
      purchaseOrderId: orderId,
      quantity: 1,
      unitPrice: 900,
    })
    .returning();
  if (!customLine) throw new Error('Custom line insert did not return a row');
  await db
    .insert(purchaseOrderLineArrivals)
    .values({ actorUserId, lineId: customLine.id, purchaseOrderId: orderId, quantity: 1 });
  await db.insert(purchaseOrderAmendments).values({
    actorUserId,
    kind: 'expected-date-change',
    newExpectedDate: '2026-08-20',
    note: 'Supplier pushed the date',
    purchaseOrderId: orderId,
  });
  await db.insert(purchaseOrderJobLinks).values({ jobId: jobs.cfo.id, purchaseOrderId: orderId });

  await movement({
    delta: 10,
    movementType: 'adjustment',
    partId: parts.piece.id,
    reason: 'opening-balance',
    unitCost: 5,
  });
  await movement({ delta: 5, movementType: 'receipt', partId: parts.piece.id, purchaseOrderId: orderId, unitCost: 8 });
  await movement({ delta: -3, jobId: jobs.cfo.id, movementType: 'checkout', partId: parts.piece.id });
  await movement({ delta: 1, jobId: jobs.cfo.id, movementType: 'return-to-store', partId: parts.piece.id });
  const checkoutWithoutJob = await movement({
    delta: -2,
    movementType: 'checkout',
    note: 'Workshop consumables',
    partId: parts.piece.id,
    recipientUserId: actorUserId,
  });
  await movement({
    delta: 1,
    movementType: 'return-to-store',
    partId: parts.piece.id,
    recipientUserId: actorUserId,
    sourceCheckoutId: checkoutWithoutJob,
  });
  const returnToSupplier = await movement({
    delta: -1,
    movementType: 'return-to-supplier',
    partId: parts.piece.id,
    purchaseOrderId: orderId,
    reason: 'defective',
    unitCost: 8,
  });

  await movement({
    delta: 2,
    lengthMm: 6_000,
    movementType: 'receipt',
    partId: parts.linear.id,
    purchaseOrderId: orderId,
    unitCost: 125,
  });
  await movement({
    delta: -1,
    jobId: jobs.custom.id,
    lengthMm: 6_000,
    movementType: 'checkout',
    partId: parts.linear.id,
  });

  await movement({
    delta: 4,
    movementType: 'receipt',
    partId: parts.measured.id,
    purchaseOrderId: orderId,
    unitCost: 12.5,
  });
  const revaluation = await movement({
    delta: 0,
    movementType: 'revaluation',
    partId: parts.measured.id,
    unitCost: 13.333_333,
  });

  const [build] = await db
    .insert(stockBuilds)
    .values({ actorUserId, builtPartId: parts.fabricated.id, quantity: 2 })
    .returning();
  if (!build) throw new Error('Build insert did not return a row');
  await movement({ buildId: build.id, delta: -2, movementType: 'build-consume', partId: parts.piece.id });
  await movement({
    buildId: build.id,
    delta: 2,
    movementType: 'build-produce',
    partId: parts.fabricated.id,
    unitCost: 6,
  });

  const [session] = await db
    .insert(stocktakeSessions)
    .values({ closedAt: new Date(), closedByUserId: actorUserId, openedByUserId: actorUserId, scope: 'raw-material' })
    .returning();
  if (!session) throw new Error('Stocktake session insert did not return a row');
  await movement({
    delta: 1,
    lengthMm: 6_000,
    movementType: 'adjustment',
    partId: parts.periodic.id,
    reason: 'stock-count',
    stocktakeSessionId: session.id,
  });

  const fileValues = {
    byteSize: 1,
    contentType: 'application/pdf',
    metadata: { type: 'general' },
    uploaderUserId: actorUserId,
  };
  const [invoice, creditNote] = await db
    .insert(documents)
    .values([
      {
        ...fileValues,
        filename: 'invoice.pdf',
        ownerType: 'purchase_order',
        purchaseOrderId: orderId,
        storageKey: 'po/invoice',
      },
      {
        ...fileValues,
        filename: 'credit.pdf',
        ownerType: 'purchase_order',
        purchaseOrderId: orderId,
        storageKey: 'po/credit',
      },
    ] as Array<typeof documents.$inferInsert>)
    .returning();
  if (!invoice || !creditNote) throw new Error('Purchase Order document inserts did not return rows');
  await db.insert(invoiceExtractions).values({ documentId: invoice.id, extraction: null });
  await db.insert(invoiceFlagResolutions).values({
    actorUserId,
    documentId: invoice.id,
    flagKey: 'price:measured',
    kind: 'applied',
    stockMovementId: revaluation,
  });
  await db.insert(creditNoteSettlements).values({ documentId: creditNote.id, stockMovementId: returnToSupplier });

  await db.insert(documents).values([
    { ...fileValues, filename: 'job.pdf', jobId: jobs.custom.id, ownerType: 'job', storageKey: 'job/doc' },
    { ...fileValues, filename: 'quote.pdf', ownerType: 'quote', quoteId: jobs.cfo.quoteId, storageKey: 'quote/doc' },
  ] as Array<typeof documents.$inferInsert>);
  await db.insert(jobStockCloseOuts).values({ actorUserId, jobId: jobs.custom.id });
  await db
    .insert(auditEvents)
    .values({ action: 'created', entityId: orderId, entityType: 'purchase_order', summary: 'Purchase Order created' });
}

async function rowCount(db: Db, table: PgTable) {
  const [row] = await db.select({ value: count() }).from(table);
  return row?.value ?? 0;
}

async function signedOffCounts(db: Db) {
  const [purchaseOrderDocuments] = await db
    .select({ value: count() })
    .from(documents)
    .where(eq(documents.ownerType, 'purchase_order'));

  return {
    expected_purchase_order_documents: purchaseOrderDocuments?.value ?? 0,
    expected_purchase_orders: await rowCount(db, purchaseOrders),
    expected_stock_builds: await rowCount(db, stockBuilds),
    expected_stock_movements: await rowCount(db, stockMovements),
    expected_stocktake_sessions: await rowCount(db, stocktakeSessions),
  };
}

function runReset(databaseUrl: string, counts: Awaited<ReturnType<typeof signedOffCounts>>) {
  const variables = Object.entries({ actor_email: 'inventory@example.com', ...counts }).flatMap(([name, value]) => [
    '-v',
    `${name}=${value}`,
  ]);

  return runPsql('psql', ['-X', '-q', databaseUrl, ...variables, '-f', scriptPath]);
}

describe.skipIf(!hasPsql)('2026-09-28 production stock reset (needs psql on PATH)', () => {
  test('carries every costed Part over at its moving average and leaves an uncosted Part uncosted', async ({
    context,
  }) => {
    const { databaseUrl, db, parts } = context;
    await seedLedger(db, context);
    const partIds = Object.values(parts).map((part) => part.id);
    const before = await loadMovingAverages(db, partIds);

    await runReset(databaseUrl, await signedOffCounts(db));

    const after = await loadMovingAverages(db, partIds);
    for (const part of [parts.piece, parts.linear, parts.measured, parts.fabricated]) {
      expect(after.get(part.id), part.code).toBeCloseTo(before.get(part.id) as number, 6);
    }
    expect(after.get(parts.periodic.id) ?? null).toBeNull();

    const ledger = await db.select().from(stockMovements);
    expect(ledger).toHaveLength(4);
    expect(
      new Set(ledger.map((row) => [row.movementType, row.reason, row.delta, row.actorUserId, row.note].join())),
    ).toEqual(new Set([`adjustment,opening-balance,0,${actorUserId},Cost carried over on reset 2026-09-28`]));
    expect(ledger.find((row) => row.partId === parts.linear.id)).toMatchObject({ lengthMm: 6_000, unitCost: 125 });
  });

  test('clears Purchase Orders, their documents, builds and stocktakes, and keeps everything that is not stock', async ({
    context,
  }) => {
    const { databaseUrl, db } = context;
    await seedLedger(db, context);
    const [lastCode] = await db.select({ value: sql<number>`max(${purchaseOrders.code})` }).from(purchaseOrders);

    await runReset(databaseUrl, await signedOffCounts(db));

    for (const table of [
      purchaseOrders,
      purchaseOrderLines,
      purchaseOrderLineArrivals,
      purchaseOrderAmendments,
      purchaseOrderJobLinks,
      invoiceExtractions,
      invoiceFlagResolutions,
      creditNoteSettlements,
      stockBuilds,
      stocktakeSessions,
    ]) {
      expect(await rowCount(db, table)).toBe(0);
    }
    const survivingDocuments = await db.select({ ownerType: documents.ownerType }).from(documents);
    expect(survivingDocuments.map((row) => row.ownerType).sort()).toEqual(['job', 'quote']);
    expect(await rowCount(db, jobStockCloseOuts)).toBe(1);
    expect(await rowCount(db, auditEvents)).toBe(1);

    const [nextOrder] = await db.insert(purchaseOrders).values({ supplierId: context.supplierId }).returning();
    expect(nextOrder?.code).toBeGreaterThan(lastCode?.value ?? 0);
  });

  test('aborts with nothing changed when production has drifted from the signed-off counts', async ({ context }) => {
    const { databaseUrl, db } = context;
    await seedLedger(db, context);
    const counts = await signedOffCounts(db);

    await expect(
      runReset(databaseUrl, { ...counts, expected_stock_movements: counts.expected_stock_movements + 1 }),
    ).rejects.toThrow(/stock movements/);

    expect(await signedOffCounts(db)).toEqual(counts);
  });
});
