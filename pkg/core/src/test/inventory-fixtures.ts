import type { Db } from '@pkg/db';
import {
  customers,
  jobCfoAssemblies,
  jobCfoParts,
  jobs,
  parts,
  purchaseOrderLines,
  purchaseOrders,
  quotes,
  supplier,
  user,
} from '@pkg/db';
import type { PostAdjustmentInput } from '@pkg/schema';

import { createTester } from './create-tester.js';

/**
 * The one seeded ledger every inventory suite runs against: a Part of each unit class, a Job with
 * CFO and a Job without, and the actor that posts. Shared rather than copied so a suite split — the
 * receipt tests sit in their own file — cannot drift into testing a different world.
 */

export const actorUserId = 'inventory-test-user';

export const test = createTester(async ({ db }) => {
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'inventory@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Inventory Tester',
    role: 'admin',
    updatedAt: now,
  });
  const [createdSupplier] = await db
    .insert(supplier)
    .values({ companyName: 'Ledger Supplier' })
    .returning({ id: supplier.id });

  if (!createdSupplier) {
    throw new Error('Supplier insert did not return a row');
  }

  const seededParts = await seedParts(db, createdSupplier.id);
  const seededJobs = await seedJobs(db, seededParts.piece.id);
  return { jobs: seededJobs, parts: seededParts, supplierId: createdSupplier.id };
});

/** An opening balance, the one adjustment that may carry a cost — every suite seeds stock with it. */
export function adjustmentInput(partId: string, overrides: Partial<PostAdjustmentInput> = {}): PostAdjustmentInput {
  return {
    delta: 1,
    lengthMm: null,
    note: null,
    partId,
    reason: 'opening-balance',
    unitCost: null,
    ...overrides,
  };
}

export async function seedSentPurchaseOrder(
  db: Db,
  supplierId: string,
  lines: ReadonlyArray<{ partId: string; quantity: number; unitPrice: number }>,
  status: 'draft' | 'sent' = 'sent',
): Promise<string> {
  const [purchaseOrder] = await db
    .insert(purchaseOrders)
    .values({ sentAt: status === 'sent' ? new Date('2026-08-02T08:00:00.000Z') : null, status, supplierId })
    .returning({ id: purchaseOrders.id });
  if (!purchaseOrder) throw new Error('Purchase Order insert did not return a row');

  await db.insert(purchaseOrderLines).values(lines.map((line) => ({ ...line, purchaseOrderId: purchaseOrder.id })));

  return purchaseOrder.id;
}

export async function seedParts(db: Db, supplierId: string) {
  const [piece, linear, measured, periodic, fabricated] = await db
    .insert(parts)
    .values([
      partValues({ code: 'PIECE', supplierId, unitOfMeasure: 'piece' }),
      partValues({ code: 'LINEAR', standardPurchaseLengthMm: 6_000, supplierId, unitOfMeasure: 'mm' }),
      partValues({ code: 'MEASURED', supplierId, unitOfMeasure: 'kg' }),
      partValues({
        code: 'PERIODIC',
        standardPurchaseLengthMm: 6_000,
        stockTrackingMode: 'periodic',
        supplierId,
        unitOfMeasure: 'mm',
      }),
      partValues({ code: 'FABRICATED', isInternallyFabricated: true, supplierId, unitOfMeasure: 'piece' }),
    ])
    .returning();

  if (!piece || !linear || !measured || !periodic || !fabricated) {
    throw new Error('Part inserts did not return all rows');
  }

  return { fabricated, linear, measured, periodic, piece };
}

export async function seedJobs(db: Db, cfoPartId: string) {
  const [customer] = await db.insert(customers).values({ companyName: 'Inventory Customer' }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [cfoQuote, customQuote] = await db
    .insert(quotes)
    .values([
      {
        customerId: customer.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: actorUserId,
        status: 'accepted',
        workTitle: 'CFO fabrication',
      },
      {
        customerId: customer.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: actorUserId,
        status: 'accepted',
        workTitle: 'Off-CFO repair',
      },
    ])
    .returning();
  if (!cfoQuote || !customQuote) throw new Error('Quote inserts did not return rows');

  const [cfo, custom] = await db
    .insert(jobs)
    .values([{ quoteId: cfoQuote.id }, { quoteId: customQuote.id }])
    .returning();
  if (!cfo || !custom) throw new Error('Job inserts did not return rows');

  const assemblies = await db
    .insert(jobCfoAssemblies)
    .values([
      { assemblyName: 'First assembly', jobId: cfo.id, kind: 'standard', sequence: 0 },
      { assemblyName: 'Second assembly', jobId: cfo.id, kind: 'optional', sequence: 1 },
    ])
    .returning();
  const [firstAssembly, secondAssembly] = assemblies;
  if (!firstAssembly || !secondAssembly) throw new Error('CFO assembly inserts did not return rows');

  await db.insert(jobCfoParts).values([
    { cfoAssemblyId: firstAssembly.id, partId: cfoPartId, quantity: 3 },
    { cfoAssemblyId: secondAssembly.id, partId: cfoPartId, quantity: 2 },
  ]);

  return { cfo, custom };
}

export function partValues({
  code,
  isInternallyFabricated = false,
  standardPurchaseLengthMm = null,
  stockTrackingMode = 'perpetual',
  supplierId,
  unitOfMeasure,
}: {
  code: string;
  isInternallyFabricated?: boolean;
  standardPurchaseLengthMm?: number | null;
  stockTrackingMode?: 'periodic' | 'perpetual';
  supplierId: string;
  unitOfMeasure: 'kg' | 'mm' | 'piece';
}) {
  return {
    category: 'Test',
    code,
    description: `${code} description`,
    finish: 'None',
    isInternallyFabricated,
    name: code,
    standardPurchaseLengthMm,
    stockTrackingMode,
    supplierCode: code,
    // Supplier XOR BOM: a built Part is made in-house and bought from nobody.
    supplierId: isInternallyFabricated ? null : supplierId,
    unitOfMeasure,
  };
}
