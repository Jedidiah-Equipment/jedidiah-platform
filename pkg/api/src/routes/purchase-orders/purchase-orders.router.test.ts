import { customers, jobs, parts, quotes, supplier, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { mockSession } from '../../test/test-utils.js';

const SUPPLIER_ID = '00000000-0000-4000-8000-000000000301';
const PART_ID = '00000000-0000-4000-8000-000000000302';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'admin',
    updatedAt: new Date(),
  });
  await db.insert(supplier).values({ companyName: 'Router Supplies', id: SUPPLIER_ID });
  await db.insert(parts).values({
    category: 'Pipe',
    code: 'PO-ROUTER-PART',
    description: 'Router test Part',
    finish: 'Plain',
    id: PART_ID,
    name: 'Router Part',
    supplierCode: 'ROUTER-1',
    supplierId: SUPPLIER_ID,
    unitOfMeasure: 'piece',
  });
  const [customer] = await db
    .insert(customers)
    .values({ companyName: 'Router Customer', email: 'customer@example.com', phone: '0123456789', vatNumber: 'VAT-1' })
    .returning({ id: customers.id });
  if (!customer) throw new Error('Customer fixture was not created');
  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      kind: 'custom',
      productId: null,
      quotedBasePrice: 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      status: 'draft',
      workTitle: 'Router repair',
    })
    .returning({ id: quotes.id });
  if (!quote) throw new Error('Quote fixture was not created');
  const [job] = await db.insert(jobs).values({ quoteId: quote.id }).returning({ id: jobs.id });
  if (!job) throw new Error('Job fixture was not created');

  return { db, jobId: job.id };
});

describe('purchaseOrders router', () => {
  test('enforces lifecycle permissions and applies the cost gate to line prices', async ({ context }) => {
    const admin = context.createCaller();
    const stores = context.createCaller(mockSession('stores'));
    const sales = context.createCaller(mockSession('sales'));
    const created = await admin.purchaseOrders.create({ supplierId: SUPPLIER_ID });
    await admin.purchaseOrders.saveDraft({
      expectedDeliveryDate: null,
      id: created.id,
      jobIds: [],
      lines: [{ partId: PART_ID, quantity: 2, unitPrice: 150 }],
      supplierId: SUPPLIER_ID,
    });

    await expect(admin.purchaseOrders.get({ id: created.id })).resolves.toMatchObject({
      lines: [{ unitPrice: 150 }],
    });
    await expect(stores.purchaseOrders.get({ id: created.id })).resolves.toMatchObject({
      lines: [{ unitPrice: null }],
    });
    await expect(stores.purchaseOrders.create({ supplierId: SUPPLIER_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(sales.purchaseOrders.get({ id: created.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // The gate covers the list read too, not just the single order.
    await expect(stores.purchaseOrders.list({ cursor: 0, limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ lines: [expect.objectContaining({ unitPrice: null })] })],
    });
  });

  test('sends a populated draft and cancels a zero-receipt draft through their named permissions', async ({
    context,
  }) => {
    const admin = context.createCaller();
    const sendable = await admin.purchaseOrders.create({ supplierId: SUPPLIER_ID });
    await admin.purchaseOrders.saveDraft({
      expectedDeliveryDate: null,
      id: sendable.id,
      jobIds: [context.jobId],
      lines: [{ partId: PART_ID, quantity: 2, unitPrice: 150 }],
      supplierId: SUPPLIER_ID,
    });

    await expect(admin.purchaseOrders.markSent({ id: sendable.id })).resolves.toMatchObject({ status: 'sent' });
    await expect(admin.jobs.get({ id: context.jobId })).resolves.toMatchObject({
      documents: [expect.objectContaining({ ownerType: 'purchase_order' })],
    });
    await expect(
      context.createCaller(mockSession('job-viewer')).jobs.get({ id: context.jobId }),
    ).resolves.toMatchObject({
      documents: [],
    });

    const cancellable = await admin.purchaseOrders.create({ supplierId: SUPPLIER_ID });
    await expect(admin.purchaseOrders.cancel({ id: cancellable.id })).resolves.toMatchObject({ status: 'cancelled' });
  });
});
