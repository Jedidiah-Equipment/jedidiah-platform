import { auditEvents, createDatabaseClient, parts, purchaseOrders, supplier, user } from '@pkg/db';
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createPart, getPart } from '../parts/part-service.js';
import { amendPurchaseOrderQuantity } from '../purchase-orders/purchase-order-amendment-service.js';
import {
  approvePurchaseOrder,
  getPurchaseOrder,
  markPurchaseOrderSent,
  savePurchaseOrderDraft,
} from '../purchase-orders/purchase-order-service.js';
import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { partValues } from '../test/part-fixtures.js';
import {
  createSupplier,
  getSupplier,
  getSupplierMergePreview,
  mergeSupplier,
  removeSupplier,
} from './supplier-service.js';

const ACTOR_ID = 'supplier-merge-test-user';
const SOURCE_ID = '00000000-0000-4000-8000-000000000101';
const TARGET_ID = '00000000-0000-4000-8000-000000000102';
const PART_ID = '00000000-0000-4000-8000-000000000201';
const PURCHASE_ORDER_ID = '00000000-0000-4000-8000-000000000301';
const APPROVED_ORDER_ID = '00000000-0000-4000-8000-000000000302';
const SENT_ORDER_ID = '00000000-0000-4000-8000-000000000303';
const CANCELLED_ORDER_ID = '00000000-0000-4000-8000-000000000304';
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values({
    createdAt: now,
    email: 'supplier-merge@example.com',
    emailVerified: true,
    id: ACTOR_ID,
    name: 'Supplier Merge Tester',
    role: 'admin',
    updatedAt: now,
  });
  await db.insert(supplier).values([
    {
      address: '12 Source Road',
      companyName: 'Night Wolves',
      contactPerson: 'Source Buyer',
      email: 'source@example.com',
      id: SOURCE_ID,
      notes: 'Source note',
      phone: '+27821234567',
      thumbnailDataUrl: 'data:image/webp;base64,aaaa',
    },
    { address: '  ', companyName: 'Nightwolves', id: TARGET_ID, notes: 'Target note' },
  ]);
  await db.insert(parts).values({
    ...partValues({ code: 'NW-100', supplierId: SOURCE_ID, unitOfMeasure: 'piece' }),
    id: PART_ID,
  });
  await db.insert(purchaseOrders).values([
    { id: PURCHASE_ORDER_ID, supplierId: SOURCE_ID },
    { approvedAt: now, id: APPROVED_ORDER_ID, status: 'approved', supplierId: SOURCE_ID },
    { approvedAt: now, id: SENT_ORDER_ID, sentAt: now, status: 'sent', supplierId: SOURCE_ID },
    { id: CANCELLED_ORDER_ID, status: 'cancelled', supplierId: SOURCE_ID },
  ]);

  return { db };
});

describe('mergeSupplier', () => {
  test('moves parts and purchase orders together, then retires the source', async ({ context }) => {
    await expect(
      mergeSupplier({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { sourceId: SOURCE_ID, targetId: TARGET_ID },
      }),
    ).resolves.toMatchObject({ id: TARGET_ID, companyName: 'Nightwolves' });

    await expect(getPart({ db: context.db, id: PART_ID })).resolves.toMatchObject({ supplierId: TARGET_ID });
    for (const id of [PURCHASE_ORDER_ID, APPROVED_ORDER_ID, SENT_ORDER_ID, CANCELLED_ORDER_ID]) {
      await expect(getPurchaseOrder({ db: context.db, id })).resolves.toMatchObject({
        supplier: { id: TARGET_ID },
      });
    }
    await expect(getSupplier({ db: context.db, id: SOURCE_ID })).rejects.toMatchObject({
      code: 'supplier.not_found',
    });
  });

  test('previews the source counts', async ({ context }) => {
    await expect(getSupplierMergePreview({ db: context.db, sourceId: SOURCE_ID })).resolves.toEqual({
      partCount: 1,
      purchaseOrderCount: 4,
    });
  });

  test('fills only empty target contact fields and audits both suppliers', async ({ context }) => {
    const merged = await mergeSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { sourceId: SOURCE_ID, targetId: TARGET_ID },
    });

    expect(merged).toMatchObject({
      address: '12 Source Road',
      contactPerson: 'Source Buyer',
      email: 'source@example.com',
      notes: 'Target note',
      phone: '+27821234567',
      thumbnailDataUrl: 'data:image/webp;base64,aaaa',
    });
    const events = await context.db.select().from(auditEvents);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'updated',
          entityId: TARGET_ID,
          changes: expect.objectContaining({
            address: { from: '  ', to: '12 Source Road' },
            contactPerson: { from: null, to: 'Source Buyer' },
          }),
        }),
        expect.objectContaining({
          action: 'merged',
          entityId: SOURCE_ID,
          summary: "Merged supplier 'Night Wolves' into 'Nightwolves'",
          changes: expect.objectContaining({
            movedParts: { from: null, to: 1 },
            movedPurchaseOrders: { from: null, to: 4 },
          }),
        }),
        expect.objectContaining({
          action: 'merged',
          entityId: TARGET_ID,
          summary: "Absorbed supplier 'Night Wolves' (1 parts, 4 purchase orders)",
        }),
      ]),
    );
  });

  test('does not record a fill update when the target has every contact field', async ({ context }) => {
    await context.db
      .update(supplier)
      .set({
        address: 'Target address',
        contactPerson: 'Target buyer',
        email: 'target@example.com',
        notes: 'Target note',
        phone: '+27829876543',
        thumbnailDataUrl: 'data:image/webp;base64,bbbb',
      })
      .where(eq(supplier.id, TARGET_ID));

    const merged = await mergeSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { sourceId: SOURCE_ID, targetId: TARGET_ID },
    });

    expect(merged).toMatchObject({ email: 'target@example.com', notes: 'Target note' });
    const events = await context.db.select().from(auditEvents);
    expect(events.filter((event) => event.action === 'updated')).toHaveLength(0);
  });

  test('rejects self-merges and missing or retired suppliers', async ({ context }) => {
    await expect(
      mergeSupplier({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { sourceId: SOURCE_ID, targetId: SOURCE_ID },
      }),
    ).rejects.toMatchObject({ code: 'supplier.merge_self' });
    await removeSupplier({ actorUserId: ACTOR_ID, db: context.db, id: TARGET_ID });
    await expect(
      mergeSupplier({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { sourceId: SOURCE_ID, targetId: TARGET_ID },
      }),
    ).rejects.toMatchObject({ code: 'supplier.not_found' });
    await expect(
      mergeSupplier({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { sourceId: '00000000-0000-4000-8000-000000000999', targetId: SOURCE_ID },
      }),
    ).rejects.toMatchObject({ code: 'supplier.not_found' });
  });

  test('frees the source name and keeps its draft purchase order saveable', async ({ context }) => {
    await mergeSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { sourceId: SOURCE_ID, targetId: TARGET_ID },
    });

    await expect(
      createSupplier({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          address: null,
          companyName: 'Night Wolves',
          contactPerson: null,
          email: null,
          notes: null,
          phone: null,
          thumbnailDataUrl: null,
        },
      }),
    ).resolves.toMatchObject({ companyName: 'Night Wolves' });
    await expect(
      savePurchaseOrderDraft({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: {
          expectedDeliveryDate: null,
          id: PURCHASE_ORDER_ID,
          jobIds: [],
          lines: [{ partId: PART_ID, quantity: 2, unitPrice: 10 }],
          supplierId: TARGET_ID,
        },
      }),
    ).resolves.toMatchObject({ lines: [{ partId: PART_ID }], supplier: { id: TARGET_ID } });
  });

  test('keeps a sent source purchase order amendable after the merge', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();
    await savePurchaseOrderDraft({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: {
        expectedDeliveryDate: null,
        id: PURCHASE_ORDER_ID,
        jobIds: [],
        lines: [{ partId: PART_ID, quantity: 2, unitPrice: 10 }],
        supplierId: SOURCE_ID,
      },
    });
    await approvePurchaseOrder({ actorUserId: ACTOR_ID, db: context.db, id: PURCHASE_ORDER_ID });
    await markPurchaseOrderSent({
      actorUserId: ACTOR_ID,
      db: context.db,
      id: PURCHASE_ORDER_ID,
      pdfRenderer: async () => PDF_BYTES,
      storage,
    });
    await mergeSupplier({
      actorUserId: ACTOR_ID,
      db: context.db,
      input: { sourceId: SOURCE_ID, targetId: TARGET_ID },
    });

    await expect(
      amendPurchaseOrderQuantity({
        actorUserId: ACTOR_ID,
        db: context.db,
        input: { id: PURCHASE_ORDER_ID, note: 'Supplier confirmed one extra', partId: PART_ID, quantity: 3 },
        pdfRenderer: async () => PDF_BYTES,
        storage,
      }),
    ).resolves.toMatchObject({
      lines: [{ partId: PART_ID, quantity: 3 }],
      supplier: { id: TARGET_ID },
    });
  });

  test('refuses a part assignment that waited behind supplier retirement', async ({ context }) => {
    const concurrentClient = createDatabaseClient(context.databaseUrl, { max: 1 });
    let releaseRetirement = () => {};
    const holdRetirement = new Promise<void>((resolve) => {
      releaseRetirement = resolve;
    });
    let signalRetirementLocked = () => {};
    const retirementLocked = new Promise<void>((resolve) => {
      signalRetirementLocked = resolve;
    });
    const retirement = context.db.transaction(async (tx) => {
      await tx.update(supplier).set({ deletedAt: new Date() }).where(eq(supplier.id, SOURCE_ID));
      signalRetirementLocked();
      await holdRetirement;
    });
    await retirementLocked;

    let creationSettled = false;
    const creation = createPart({
      actorUserId: ACTOR_ID,
      db: concurrentClient.db,
      input: {
        averageUtilizationPercent: null,
        category: 'Test',
        code: 'NW-RACE',
        description: 'Concurrent supplier retirement regression',
        drawingCode: null,
        finish: 'None',
        isInternallyFabricated: false,
        minimumStock: null,
        name: 'NW-RACE',
        standardPurchaseLengthMm: null,
        stockTrackingMode: 'perpetual',
        storageLocation: null,
        supplierCode: 'NW-RACE',
        supplierId: SOURCE_ID,
        unitOfMeasure: 'piece',
      },
    }).then(
      (value) => {
        creationSettled = true;
        return { status: 'fulfilled' as const, value };
      },
      (error: unknown) => {
        creationSettled = true;
        return { error, status: 'rejected' as const };
      },
    );

    try {
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
      expect(creationSettled).toBe(false);
    } finally {
      releaseRetirement();
    }
    await retirement;

    const result = await creation;
    expect(result).toMatchObject({ error: { code: 'part.supplier_not_found' }, status: 'rejected' });
    await expect(context.db.$count(parts, eq(parts.code, 'NW-RACE'))).resolves.toBe(0);
    await concurrentClient.close();
  });

  test('does not deadlock with a Part writer that locks the Part before its Supplier', async ({ context }) => {
    const mergeClient = createDatabaseClient(context.databaseUrl, { max: 1 });
    let releaseSupplierCheck = () => {};
    const waitToCheckSupplier = new Promise<void>((resolve) => {
      releaseSupplierCheck = resolve;
    });
    let signalPartLocked = () => {};
    const partLocked = new Promise<void>((resolve) => {
      signalPartLocked = resolve;
    });
    const partWriter = context.db.transaction(async (tx) => {
      await tx.select({ id: parts.id }).from(parts).where(eq(parts.id, PART_ID)).for('update');
      signalPartLocked();
      await waitToCheckSupplier;
      const [liveSupplier] = await tx
        .select({ id: supplier.id })
        .from(supplier)
        .where(eq(supplier.id, SOURCE_ID))
        .for('share');
      if (!liveSupplier) throw new Error('Expected the source Supplier to remain live for the waiting writer');
    });
    await partLocked;

    const merge = mergeSupplier({
      actorUserId: ACTOR_ID,
      db: mergeClient.db,
      input: { sourceId: SOURCE_ID, targetId: TARGET_ID },
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
    releaseSupplierCheck();

    const [writerResult, mergeResult] = await Promise.allSettled([partWriter, merge]);
    await mergeClient.close();
    expect(writerResult).toMatchObject({ status: 'fulfilled' });
    expect(mergeResult).toMatchObject({ status: 'fulfilled', value: { id: TARGET_ID } });
  });

  test('does not deadlock with a draft save that locks its order before line Parts', async ({ context }) => {
    const mergeClient = createDatabaseClient(context.databaseUrl, { max: 1 });
    let releaseLineCheck = () => {};
    const waitToCheckLine = new Promise<void>((resolve) => {
      releaseLineCheck = resolve;
    });
    let signalOrderLocked = () => {};
    const orderLocked = new Promise<void>((resolve) => {
      signalOrderLocked = resolve;
    });
    const draftWriter = context.db.transaction(async (tx) => {
      await tx
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, PURCHASE_ORDER_ID))
        .for('update');
      signalOrderLocked();
      await waitToCheckLine;
      await tx.select({ id: parts.id }).from(parts).where(eq(parts.id, PART_ID)).for('key share');
      const [liveSupplier] = await tx
        .select({ id: supplier.id })
        .from(supplier)
        .where(eq(supplier.id, SOURCE_ID))
        .for('share');
      if (!liveSupplier) throw new Error('Expected the source Supplier to remain live for the waiting draft save');
    });
    await orderLocked;

    const merge = mergeSupplier({
      actorUserId: ACTOR_ID,
      db: mergeClient.db,
      input: { sourceId: SOURCE_ID, targetId: TARGET_ID },
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
    releaseLineCheck();

    const [writerResult, mergeResult] = await Promise.allSettled([draftWriter, merge]);
    await mergeClient.close();
    expect(writerResult).toMatchObject({ status: 'fulfilled' });
    expect(mergeResult).toMatchObject({ status: 'fulfilled', value: { id: TARGET_ID } });
  });
});
