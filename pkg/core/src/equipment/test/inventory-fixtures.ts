import type { Db } from '@pkg/db';
import {
  customers,
  jobCfoAssemblies,
  jobCfoParts,
  jobs,
  parts,
  productRanges,
  products,
  productUnits,
  purchaseOrderLines,
  purchaseOrders,
  quotes,
  supplier,
  user,
} from '@pkg/db';
import type { PostAdjustmentInput, ProductCostEstimate } from '@pkg/schema';

import { createTester } from './create-tester.js';
import { partValues } from './part-fixtures.js';

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

/**
 * A stores person the tablet's quick-switch can name — the "person attributes" half of spec §11.
 * Distinct from `actorUserId`, which stands in for the signed-in device session.
 */
export async function seedQuickSwitchPerson(
  db: Db,
  { banned = false, id = 'quick-switch-person', isDevice = false, name = 'Quick Switch Person' } = {},
): Promise<string> {
  await db.insert(user).values({
    banned,
    isDevice,
    createdAt: new Date('2026-08-01T08:00:00.000Z'),
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    name,
    role: 'stores',
    updatedAt: new Date('2026-08-01T08:00:00.000Z'),
  });

  return id;
}

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

export function estimateSnapshot(part: typeof parts.$inferSelect, quantityPerUnit: number): ProductCostEstimate {
  return {
    assemblies: [],
    basePrice: 0,
    complete: true,
    currencyCode: 'ZAR',
    estimatedMarginCeiling: 0,
    laborCostFloor: 0,
    laborHours: [],
    materialCostFloor: 0,
    materialLines: [
      {
        costFloor: 0,
        partCode: part.code,
        partId: part.id,
        partName: part.name,
        quantityPerUnit,
        standardPurchaseLengthMm: part.standardPurchaseLengthMm,
        unitCost: null,
        unitOfMeasure: part.unitOfMeasure,
      },
    ],
    missing: { laborHours: false, materialList: false, unattributedProductTerms: false, uncostedParts: [] },
    optionalAssemblies: [],
    partsCostFloor: 0,
    productId: '00000000-0000-4000-8000-000000000001',
    scope: 'build',
    totalCostFloor: 0,
  };
}

/** A minimal machine identity that turns an otherwise generic Job fixture into a Product Job. */
export async function seedProductUnit(db: Db, code = 'ESTIMATE') {
  const [range] = await db
    .insert(productRanges)
    .values({ displayOrder: 0, name: `${code} range` })
    .returning();
  if (!range) throw new Error('Product Range insert did not return a row');

  const [product] = await db
    .insert(products)
    .values({ basePrice: 0, buildTimeDays: 1, modelCode: code, name: `${code} product`, rangeId: range.id })
    .returning();
  if (!product) throw new Error('Product insert did not return a row');

  const [unit] = await db
    .insert(productUnits)
    .values({
      productId: product.id,
      productSerialNumber: `${code}-1`,
      productSerialPrefix: code,
      productSerialSequence: 1,
      productSerialYear: 26,
    })
    .returning();
  if (!unit) throw new Error('Product Unit insert did not return a row');

  return unit;
}

/**
 * An order in the shape the on-order and late-order reads judge: sent unless told otherwise, with a
 * priced line per Part. `expectedDeliveryDate` defaults to unpromised, which is what the receiving
 * suites want and what the late-order read is required to ignore.
 */
export async function seedSentPurchaseOrder(
  db: Db,
  supplierId: string,
  lines: ReadonlyArray<{ partId: string; quantity: number; unitPrice?: number }>,
  {
    expectedDeliveryDate = null,
    status = 'sent',
  }: { expectedDeliveryDate?: string | null; status?: 'draft' | 'sent' } = {},
): Promise<string> {
  const sentAt = status === 'sent' ? new Date('2026-08-02T08:00:00.000Z') : null;
  const [purchaseOrder] = await db
    .insert(purchaseOrders)
    .values({
      // Sent implies approved, which the DB shape check enforces — the same invariant the migration
      // backfilled onto history.
      approvedAt: sentAt,
      expectedDeliveryDate,
      sentAt,
      status,
      supplierId,
    })
    .returning({ id: purchaseOrders.id });
  if (!purchaseOrder) throw new Error('Purchase Order insert did not return a row');

  await db
    .insert(purchaseOrderLines)
    .values(lines.map((line) => ({ unitPrice: 10, ...line, purchaseOrderId: purchaseOrder.id })));

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
