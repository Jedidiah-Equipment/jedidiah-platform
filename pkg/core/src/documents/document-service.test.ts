import {
  auditEvents,
  customers,
  documents,
  jobs,
  productAssemblies,
  products,
  quoteLineItems,
  quoteSelectedAssemblies,
  quotes,
  user,
} from '@pkg/db';
import { PRODUCT_DOCUMENT_MAX_BYTES } from '@pkg/domain';
import { createPdfBytesWithPageSizes, getPdfPageSizes } from '@pkg/pdf';
import {
  BROCHURE_IMAGE_SLOTS,
  type BrochurePdfRenderer,
  formatQuoteCode,
  type ProductImageSlot,
  type UUID,
} from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createJobPurchaseOrder, deleteJobPurchaseOrder } from '../jobs/job-document-service.js';
import { JobNotFoundError } from '../jobs/job-errors.js';
import { readJobDocument } from '../jobs/job-read-service.js';
import { ProductNotFoundError } from '../products/product-errors.js';
import {
  createProductDocument,
  deleteProductDocument,
  getProductDocuments,
  readProductDocument,
} from '../products/product-service.js';
import { createQuoteDocument, getQuoteDocuments, readQuoteDocument } from '../quotes/quote-document.js';
import { generateQuoteDocument } from '../quotes/quote-document-generation.js';
import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import {
  DocumentDeleteNotAllowedError,
  DocumentNotFoundError,
  DocumentPolicyViolationError,
  DuplicateDocumentFilenameError,
} from './document-errors.js';

const ACTOR_USER_ID = 'test-user-id';
const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

const test = createTester(async ({ db }) => {
  const rangeId = await createProductRangeFixture(db);

  await db.insert(user).values({
    id: ACTOR_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    phoneNumber: '+27821234567',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'DOC-TEST',
      name: 'Document Test Product',
      rangeId,
    })
    .returning({ id: products.id });

  const [otherProduct] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'DOC-OTHER',
      name: 'Other Document Test Product',
      rangeId,
    })
    .returning({ id: products.id });

  if (!product || !otherProduct) {
    throw new Error('Product insert did not return a row');
  }

  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Document Quote Customer',
      email: 'documents@example.com',
      phone: '012 345 6789',
      vatNumber: 'VAT-DOC-123',
    })
    .returning({ id: customers.id });
  if (!customer) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId: product.id,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_USER_ID,
      status: 'sent',
    })
    .returning({ code: quotes.code, id: quotes.id });
  if (!quote) throw new Error('Quote insert did not return a row');

  const [optionalAssembly] = await db
    .insert(productAssemblies)
    .values({
      displayOrder: 0,
      kind: 'optional',
      name: 'Canvas Canopy',
      price: 250,
      productId: product.id,
    })
    .returning({ id: productAssemblies.id });
  if (!optionalAssembly) throw new Error('Product assembly insert did not return a row');

  await db.insert(quoteSelectedAssemblies).values([
    {
      productAssemblyId: optionalAssembly.id,
      quoteId: quote.id,
      quotedName: 'Canvas Canopy',
      quotedPrice: 250,
    },
    {
      productAssemblyId: null,
      quoteId: quote.id,
      quotedName: 'Deleted Light Bar',
      quotedPrice: 125,
    },
  ]);
  await db.insert(quoteLineItems).values({
    name: 'Hydraulic hose',
    quantity: 2,
    quoteId: quote.id,
    unitPrice: 150,
  });

  return {
    customerId: customer.id,
    otherProductId: otherProduct.id,
    productId: product.id,
    quoteCode: quote.code,
    quoteId: quote.id,
    storage: new InMemoryStorageAdapter(),
  };
});

describe('Job Purchase Orders', () => {
  test('rejects Purchase Order uploads and deletes for cancelled Jobs', async ({ context }) => {
    const job = await createCustomJobOwner(context.db, context.customerId);
    const document = await createJobPurchaseOrder({
      actorUserId: ACTOR_USER_ID,
      bytes: pdfBytes(),
      db: context.db,
      filename: 'PO-BEFORE-CANCEL.pdf',
      jobId: job.id,
      storage: context.storage,
    });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      createJobPurchaseOrder({
        actorUserId: ACTOR_USER_ID,
        bytes: pdfBytes(),
        db: context.db,
        filename: 'PO-AFTER-CANCEL.pdf',
        jobId: job.id,
        storage: context.storage,
      }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
    await expect(
      deleteJobPurchaseOrder({ actorUserId: ACTOR_USER_ID, db: context.db, documentId: document.id, jobId: job.id }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
  });

  test('uploads multiple PDFs to a Custom Job as source-less Purchase Orders', async ({ context }) => {
    const job = await createCustomJobOwner(context.db, context.customerId);

    const first = await createJobPurchaseOrder({
      actorUserId: ACTOR_USER_ID,
      bytes: pdfBytes(),
      db: context.db,
      filename: 'PO-123.pdf',
      jobId: job.id,
      storage: context.storage,
    });
    const second = await createJobPurchaseOrder({
      actorUserId: ACTOR_USER_ID,
      bytes: pdfBytes(),
      db: context.db,
      filename: 'PO-124.pdf',
      jobId: job.id,
      storage: context.storage,
    });

    expect([first, second]).toEqual([
      expect.objectContaining({
        filename: 'PO-123.pdf',
        metadata: { type: 'purchase_order' },
        ownerType: 'job',
        sourceProductId: null,
        sourceProductName: null,
      }),
      expect.objectContaining({
        filename: 'PO-124.pdf',
        metadata: { type: 'purchase_order' },
        ownerType: 'job',
        sourceProductId: null,
        sourceProductName: null,
      }),
    ]);
  });

  test('deletes Purchase Orders but rejects deletion of snapshot documents', async ({ context }) => {
    const job = await createJobOwner(context.db, context.productId);
    const purchaseOrder = await createJobPurchaseOrder({
      actorUserId: ACTOR_USER_ID,
      bytes: pdfBytes(),
      db: context.db,
      filename: 'PO-DELETE.pdf',
      jobId: job.id,
      storage: context.storage,
    });
    const [snapshot] = await context.db
      .insert(documents)
      .values({
        byteSize: pdfBytes().byteLength,
        contentType: 'application/pdf',
        filename: 'Snapshot.pdf',
        jobId: job.id,
        metadata: { type: 'part_book' },
        ownerType: 'job',
        sourceProductId: context.productId,
        storageKey: 'documents/product/source/snapshot.pdf',
        uploaderUserId: ACTOR_USER_ID,
      })
      .returning();
    if (!snapshot) throw new Error('Document insert did not return a row');

    await deleteJobPurchaseOrder({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      documentId: purchaseOrder.id,
      jobId: job.id,
    });

    await expect(
      deleteJobPurchaseOrder({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        documentId: snapshot.id,
        jobId: job.id,
      }),
    ).rejects.toBeInstanceOf(DocumentDeleteNotAllowedError);
    await expect(context.db.select().from(documents)).resolves.toEqual([expect.objectContaining({ id: snapshot.id })]);
  });
});

describe('createProductDocument', () => {
  test('stores bytes, inserts a document row, and audits the storage key', async ({ context }) => {
    const bytes = pdfBytes();

    const document = await createProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: {
        bytes,
        contentType: 'application/pdf',
        filename: 'Part Book.pdf',
        metadata: { type: 'part_book' },
        productId: context.productId,
      },
      storage: context.storage,
    });

    expect(document).toMatchObject({
      byteSize: bytes.byteLength,
      contentType: 'application/pdf',
      filename: 'Part Book.pdf',
      metadata: { type: 'part_book' },
      productId: context.productId,
      uploaderEmail: 'test@example.com',
      uploaderName: 'Test User',
      uploaderUserId: ACTOR_USER_ID,
    });

    const [row] = await context.db.select().from(documents);
    expect(row).toMatchObject({
      contentType: 'application/pdf',
      filename: 'Part Book.pdf',
      productId: context.productId,
      uploaderUserId: ACTOR_USER_ID,
    });
    expect(row?.storageKey).toMatch(new RegExp(`^documents/product/${context.productId}/`));
    await expect(context.storage.get(row?.storageKey ?? '')).resolves.toMatchObject({
      byteSize: bytes.byteLength,
      contentType: 'application/pdf',
    });

    const [event] = await context.db.select().from(auditEvents);
    expect(event).toMatchObject({
      action: 'created',
      actorUserId: ACTOR_USER_ID,
      entityId: document.id,
      entityType: 'document',
      changes: {
        byteSize: {
          from: null,
          to: bytes.byteLength,
        },
        contentType: {
          from: null,
          to: 'application/pdf',
        },
        filename: {
          from: null,
          to: 'Part Book.pdf',
        },
        metadata: {
          from: null,
          to: { type: 'part_book' },
        },
        productId: {
          from: null,
          to: context.productId,
        },
        storageKey: {
          from: null,
          to: row?.storageKey,
        },
      },
    });
  });

  test('stores the server-verified content type instead of the declared upload type', async ({ context }) => {
    const document = await createProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: {
        bytes: pdfBytes(),
        contentType: 'application/octet-stream',
        filename: 'Odd Browser Mime.pdf',
        metadata: { type: 'part_book' },
        productId: context.productId,
      },
      storage: context.storage,
    });

    expect(document.contentType).toBe('application/pdf');

    const [row] = await context.db.select().from(documents);
    expect(row?.contentType).toBe('application/pdf');
    await expect(context.storage.get(row?.storageKey ?? '')).resolves.toMatchObject({
      contentType: 'application/pdf',
    });
  });

  test('rejects product images before storing anything', async ({ context }) => {
    await expect(
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: pngBytes(),
          contentType: 'application/pdf',
          filename: 'Machine Diagram.png',
          metadata: { type: 'part_book' },
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    expect(context.storage.objects.size).toBe(0);
  });

  test('rejects duplicate filenames case-insensitively per product', async ({ context }) => {
    await uploadPdf(context, { filename: 'Part Book.pdf', productId: context.productId });

    await expect(
      uploadPdf(context, { filename: 'part book.PDF', productId: context.productId }),
    ).rejects.toBeInstanceOf(DuplicateDocumentFilenameError);
    expect(context.storage.objects.size).toBe(1);

    await expect(
      uploadPdf(context, { filename: 'part book.PDF', productId: context.otherProductId }),
    ).resolves.toMatchObject({
      filename: 'part book.PDF',
      productId: context.otherProductId,
    });
  });

  test('rejects oversized and wrong-type uploads before insert', async ({ context }) => {
    await expect(
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: new Uint8Array(PRODUCT_DOCUMENT_MAX_BYTES + 1),
          contentType: 'application/pdf',
          filename: 'Too Large.pdf',
          metadata: { type: 'part_book' },
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: new Uint8Array([1, 2, 3]),
          contentType: 'application/pdf',
          filename: 'Renamed.pdf',
          metadata: { type: 'part_book' },
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    expect(context.storage.objects.size).toBe(0);
  });

  test('rejects invalid or missing metadata before storing anything', async ({ context }) => {
    await expect(
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: pdfBytes(),
          contentType: 'application/pdf',
          filename: 'Unknown Type.pdf',
          metadata: { type: 'manual' },
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(
      createProductDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: pdfBytes(),
          contentType: 'application/pdf',
          filename: 'Missing Type.pdf',
          metadata: {},
          productId: context.productId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    expect(context.storage.objects.size).toBe(0);
  });
});

describe('createQuoteDocument', () => {
  test('stores PDF bytes with revision metadata and audits the Quote owner', async ({ context }) => {
    const document = await createQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      input: {
        bytes: pdfBytes(),
        filename: 'Quote QUO-0001.pdf',
        metadata: { revision: 1 },
        quoteId: context.quoteId,
      },
      storage: context.storage,
    });

    expect(document).toMatchObject({
      contentType: 'application/pdf',
      filename: 'Quote QUO-0001.pdf',
      metadata: { revision: 1 },
      ownerType: 'quote',
      quoteId: context.quoteId,
    });

    const [row] = await context.db.select().from(documents);
    expect(row).toMatchObject({
      filename: 'Quote QUO-0001.pdf',
      metadata: { revision: 1 },
      ownerType: 'quote',
      quoteId: context.quoteId,
    });
    expect(row?.storageKey).toMatch(new RegExp(`^documents/quote/${context.quoteId}/`));

    const [event] = await context.db.select().from(auditEvents);
    expect(event).toMatchObject({
      action: 'created',
      actorUserId: ACTOR_USER_ID,
      entityId: document.id,
      entityType: 'document',
      changes: {
        metadata: {
          from: null,
          to: { revision: 1 },
        },
        quoteId: {
          from: null,
          to: context.quoteId,
        },
      },
    });
  });

  test('validates quote PDF content and revision metadata before storing anything', async ({ context }) => {
    await expect(
      createQuoteDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: pngBytes(),
          filename: 'Quote Image.png',
          metadata: { revision: 1 },
          quoteId: context.quoteId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(
      createQuoteDocument({
        actorUserId: ACTOR_USER_ID,
        db: context.db,
        input: {
          bytes: pdfBytes(),
          filename: 'Quote Missing Revision.pdf',
          metadata: {},
          quoteId: context.quoteId,
        },
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentPolicyViolationError);

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    expect(context.storage.objects.size).toBe(0);
  });

  test('rejects duplicate filenames case-insensitively per quote', async ({ context }) => {
    await uploadQuotePdf(context, { filename: 'Quote.pdf', quoteId: context.quoteId, revision: 1 });

    await expect(
      uploadQuotePdf(context, { filename: 'quote.PDF', quoteId: context.quoteId, revision: 2 }),
    ).rejects.toBeInstanceOf(DuplicateDocumentFilenameError);
    expect(context.storage.objects.size).toBe(1);
  });
});

describe('generateQuoteDocument', () => {
  test('renders saved quote data to the next Quote Document revision and audits only the document', async ({
    context,
  }) => {
    await uploadQuotePdf(context, { filename: 'Q-1-rev-1.pdf', quoteId: context.quoteId, revision: 1 });
    await context.db
      .update(quotes)
      .set({ documentNotes: 'Confirm customer details before order processing.' })
      .where(eq(quotes.id, context.quoteId));
    const beforeEvents = await context.db.select().from(auditEvents);
    const renderedInputs: Array<
      Parameters<typeof generateQuoteDocument>[0]['pdfRenderer'] extends (input: infer Input) => unknown ? Input : never
    > = [];

    const result = await generateQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      brochureRenderer: stubBrochureRenderer,
      db: context.db,
      input: {
        leadTime: '14 working days',
        quoteId: context.quoteId,
      },
      pdfRenderer: async (input) => {
        renderedInputs.push(input);
        return pdfBytes();
      },
      storage: context.storage,
    });
    const { document } = result;
    const rendered = renderedInputs[0];
    if (!rendered) throw new Error('Expected PDF renderer to receive document model');
    const quoteCode = formatQuoteCode(context.quoteCode);
    const baseItem = rendered.document.lineItems.find((item) => item.kind === 'base');
    const optionalItem = rendered.document.lineItems.find((item) => item.kind === 'optional');
    const lineItem = rendered.document.lineItems.find((item) => item.kind === 'lineItem');

    expect(document).toMatchObject({
      contentType: 'application/pdf',
      filename: `${quoteCode}-rev-2.pdf`,
      metadata: { revision: 2 },
      ownerType: 'quote',
      quoteId: context.quoteId,
    });
    expect(result.warnings).toEqual([
      {
        code: 'quote_document.brochure_config_incomplete',
        message:
          "This Quote Product's Brochure is not fully configured, so the Quote Document was generated without one.",
      },
    ]);
    expect(rendered.filename).toBe(`${quoteCode}-rev-2.pdf`);
    expect(rendered.document.quoteCode).toBe(quoteCode);
    expect(rendered.document.customer).toMatchObject({
      companyName: 'Document Quote Customer',
      email: 'documents@example.com',
      phone: '012 345 6789',
      vatNumber: 'VAT-DOC-123',
    });
    expect(rendered.document.salesPerson).toMatchObject({
      email: 'test@example.com',
      name: 'Test User',
      phoneNumber: '+27821234567',
    });
    expect(baseItem).toMatchObject({
      amount: 1_000,
      descriptionLines: ['DOC-TEST Document Test Product'],
      kind: 'base',
      quantity: 1,
      unitPrice: 1_000,
    });
    expect(optionalItem).toMatchObject({
      amount: 250,
      descriptionLines: ['Canvas Canopy'],
      kind: 'optional',
      quantity: 1,
      unitPrice: 250,
    });
    expect(lineItem).toMatchObject({
      amount: 300,
      descriptionLines: ['2 x Hydraulic hose'],
      kind: 'lineItem',
      quantity: 2,
      unitPrice: 150,
    });
    expect(rendered.document.staleSelectionNotes).toEqual(['Deleted Light Bar unavailable']);
    expect(rendered.document.notes).toEqual(['Confirm customer details before order processing.']);
    expect(rendered.document.paymentTerms).toBe('0% deposit');
    expect(rendered.document.transport).toBe('Included in sale price');
    expect(rendered.document.leadTime).toBe('14 working days');
    expect(rendered.document.subtotal).toBe(1_550);
    expect(rendered.document.vatAmount).toBe(232.5);
    expect(rendered.document.total).toBe(1_782.5);

    const events = await context.db.select().from(auditEvents);
    expect(events.slice(beforeEvents.length).map((event) => event.entityType)).toEqual(['document']);
    await expect(
      readQuoteDocument({
        db: context.db,
        documentId: document.id,
        quoteId: context.quoteId,
        storage: context.storage,
      }),
    ).resolves.toMatchObject({
      document: expect.objectContaining({ id: document.id }),
    });
  });

  test('generates the Product brochure from live config and appends it after all rendered quote pages', async ({
    context,
  }) => {
    await seedCompleteBrochureConfig(context, context.productId);

    const result = await generateQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      brochureRenderer: async () => realPdfBytes([[420, 420]]),
      db: context.db,
      input: {
        leadTime: '14 working days',
        quoteId: context.quoteId,
      },
      pdfRenderer: async () =>
        realPdfBytes([
          [200, 300],
          [210, 310],
        ]),
      storage: context.storage,
    });

    const read = await readQuoteDocument({
      db: context.db,
      documentId: result.document.id,
      quoteId: context.quoteId,
      storage: context.storage,
    });
    const pageSizes = await getPdfPageSizes(await readAll(read.object.body));

    expect(result.warnings).toEqual([]);
    expect(pageSizes).toEqual([
      { height: 300, width: 200 },
      { height: 310, width: 210 },
      { height: 420, width: 420 },
    ]);
  });

  test('generates the Product brochure for a historical quote after the Product is removed', async ({ context }) => {
    await seedCompleteBrochureConfig(context, context.productId);
    await context.db
      .update(products)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(products.id, context.productId));

    const result = await generateQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      brochureRenderer: async () => realPdfBytes([[420, 420]]),
      db: context.db,
      input: {
        leadTime: '14 working days',
        quoteId: context.quoteId,
      },
      pdfRenderer: async () => realPdfBytes([[200, 300]]),
      storage: context.storage,
    });

    const read = await readQuoteDocument({
      db: context.db,
      documentId: result.document.id,
      quoteId: context.quoteId,
      storage: context.storage,
    });
    const pageSizes = await getPdfPageSizes(await readAll(read.object.body));

    expect(result.warnings).toEqual([]);
    expect(pageSizes).toEqual([
      { height: 300, width: 200 },
      { height: 420, width: 420 },
    ]);
  });

  test('generates a quote-only PDF with a warning when the brochure config is incomplete', async ({ context }) => {
    const result = await generateQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      brochureRenderer: stubBrochureRenderer,
      db: context.db,
      input: {
        leadTime: '14 working days',
        quoteId: context.quoteId,
      },
      pdfRenderer: async () => realPdfBytes([[200, 300]]),
      storage: context.storage,
    });

    const read = await readQuoteDocument({
      db: context.db,
      documentId: result.document.id,
      quoteId: context.quoteId,
      storage: context.storage,
    });
    const pageSizes = await getPdfPageSizes(await readAll(read.object.body));

    expect(result.warnings).toEqual([
      {
        code: 'quote_document.brochure_config_incomplete',
        message:
          "This Quote Product's Brochure is not fully configured, so the Quote Document was generated without one.",
      },
    ]);
    expect(pageSizes).toEqual([{ height: 300, width: 200 }]);
  });

  test('generates a custom Quote Document from the Work Title without a brochure warning', async ({ context }) => {
    const [quote] = await context.db
      .insert(quotes)
      .values({
        customerId: context.customerId,
        deliveryIncluded: false,
        deliveryPrice: 120,
        depositPercent: 25,
        discountPercent: 10,
        documentNotes: 'Install during shutdown.',
        kind: 'custom',
        productId: null,
        quotedBasePrice: 2_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: ACTOR_USER_ID,
        status: 'sent',
        workTitle: 'Plant shutdown fabrication',
      })
      .returning({ code: quotes.code, id: quotes.id });
    if (!quote) throw new Error('Custom quote insert did not return a row');

    await context.db.insert(quoteLineItems).values({
      name: 'Site measurement',
      quantity: 2,
      quoteId: quote.id,
      unitPrice: 75,
    });

    const renderedInputs: Array<
      Parameters<typeof generateQuoteDocument>[0]['pdfRenderer'] extends (input: infer Input) => unknown ? Input : never
    > = [];

    const result = await generateQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      brochureRenderer: async () => {
        throw new Error('Custom Quote Documents must not generate Product brochures.');
      },
      db: context.db,
      input: {
        leadTime: 'Customer-confirmed shutdown window',
        quoteId: quote.id,
      },
      pdfRenderer: async (input) => {
        renderedInputs.push(input);
        return realPdfBytes([[200, 300]]);
      },
      storage: context.storage,
    });

    const rendered = renderedInputs[0];
    if (!rendered) throw new Error('Expected PDF renderer to receive document model');
    const baseItem = rendered.document.lineItems.find((item) => item.kind === 'base');
    const lineItem = rendered.document.lineItems.find((item) => item.kind === 'lineItem');
    const discountItem = rendered.document.lineItems.find((item) => item.kind === 'discount');
    const deliveryItem = rendered.document.lineItems.find((item) => item.kind === 'charge');
    const read = await readQuoteDocument({
      db: context.db,
      documentId: result.document.id,
      quoteId: quote.id,
      storage: context.storage,
    });
    const pageSizes = await getPdfPageSizes(await readAll(read.object.body));

    expect(result.warnings).toEqual([]);
    expect(rendered.filename).toBe(`${formatQuoteCode(quote.code)}-rev-1.pdf`);
    expect(baseItem).toMatchObject({
      amount: 2_000,
      descriptionLines: ['Plant shutdown fabrication'],
      kind: 'base',
      quantity: 1,
      unitPrice: 2_000,
    });
    expect(rendered.document.lineItems.some((item) => item.kind === 'optional')).toBe(false);
    expect(lineItem).toMatchObject({
      amount: 150,
      descriptionLines: ['2 x Site measurement'],
      kind: 'lineItem',
      quantity: 2,
      unitPrice: 75,
    });
    expect(discountItem).toMatchObject({
      amount: -215,
      descriptionLines: ['Discount (10%)'],
      kind: 'discount',
      quantity: 1,
      unitPrice: -215,
    });
    expect(deliveryItem).toMatchObject({
      amount: 120,
      descriptionLines: ['Delivery'],
      kind: 'charge',
      quantity: 1,
      unitPrice: 120,
    });
    expect(rendered.document.notes).toEqual(['Install during shutdown.']);
    expect(rendered.document.paymentTerms).toBe('25% deposit');
    expect(rendered.document.transport).toBe('Additional charge (R 120.00)');
    expect(rendered.document.leadTime).toBe('Customer-confirmed shutdown window');
    expect(rendered.document.subtotal).toBe(2_055);
    expect(rendered.document.vatAmount).toBe(308.25);
    expect(rendered.document.total).toBe(2_363.25);
    expect(pageSizes).toEqual([{ height: 300, width: 200 }]);
  });

  test('skips the brochure and warns when only some required fields are configured', async ({ context }) => {
    // Everything except the primary image is configured, so the completeness gate fails and the brochure
    // is skipped without blocking the quote.
    await seedCompleteBrochureConfig(context, context.productId, { omitSlots: ['primary'] });

    const result = await generateQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      brochureRenderer: stubBrochureRenderer,
      db: context.db,
      input: {
        leadTime: '14 working days',
        quoteId: context.quoteId,
      },
      pdfRenderer: async () => realPdfBytes([[200, 300]]),
      storage: context.storage,
    });

    const read = await readQuoteDocument({
      db: context.db,
      documentId: result.document.id,
      quoteId: context.quoteId,
      storage: context.storage,
    });
    const pageSizes = await getPdfPageSizes(await readAll(read.object.body));

    expect(result.warnings).toEqual([
      {
        code: 'quote_document.brochure_config_incomplete',
        message:
          "This Quote Product's Brochure is not fully configured, so the Quote Document was generated without one.",
      },
    ]);
    expect(pageSizes).toEqual([{ height: 300, width: 200 }]);
  });

  test('keeps older Quote Document packets frozen when customer details and brochures change', async ({ context }) => {
    await seedCompleteBrochureConfig(context, context.productId);
    // The brochure regenerates from live config on each generation, so a later config change must not
    // alter an already-saved packet. A stateful fake stands in for that config drift.
    let brochurePageSize: [number, number] = [300, 300];
    const brochureRenderer = async () => realPdfBytes([brochurePageSize]);

    const first = await generateQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      brochureRenderer,
      db: context.db,
      input: {
        leadTime: '14 working days',
        quoteId: context.quoteId,
      },
      pdfRenderer: async () => realPdfBytes([[200, 200]]),
      storage: context.storage,
    });

    await context.db
      .update(customers)
      .set({ companyName: 'Updated Customer Details' })
      .where(eq(customers.id, context.customerId));
    brochurePageSize = [400, 400];
    const second = await generateQuoteDocument({
      actorUserId: ACTOR_USER_ID,
      brochureRenderer,
      db: context.db,
      input: {
        leadTime: '14 working days',
        quoteId: context.quoteId,
      },
      pdfRenderer: async () => realPdfBytes([[210, 210]]),
      storage: context.storage,
    });

    const firstRead = await readQuoteDocument({
      db: context.db,
      documentId: first.document.id,
      quoteId: context.quoteId,
      storage: context.storage,
    });
    const secondRead = await readQuoteDocument({
      db: context.db,
      documentId: second.document.id,
      quoteId: context.quoteId,
      storage: context.storage,
    });
    const firstPageSizes = await getPdfPageSizes(await readAll(firstRead.object.body));
    const secondPageSizes = await getPdfPageSizes(await readAll(secondRead.object.body));

    expect(firstPageSizes).toEqual([
      { height: 200, width: 200 },
      { height: 300, width: 300 },
    ]);
    expect(secondPageSizes).toEqual([
      { height: 210, width: 210 },
      { height: 400, width: 400 },
    ]);
  });

  test('blocks generation for rejected and cancelled Quotes', async ({ context }) => {
    for (const status of ['rejected', 'cancelled'] as const) {
      const [updated] = await context.db
        .update(quotes)
        .set({ status })
        .where(eq(quotes.id, context.quoteId))
        .returning({ id: quotes.id });
      if (!updated) throw new Error('Quote update did not return a row');

      await expect(
        generateQuoteDocument({
          actorUserId: ACTOR_USER_ID,
          brochureRenderer: stubBrochureRenderer,
          db: context.db,
          input: {
            leadTime: '14 working days',
            quoteId: context.quoteId,
          },
          pdfRenderer: async () => pdfBytes(),
          storage: context.storage,
        }),
      ).rejects.toThrow('Quote Documents can only be generated for draft, sent, or accepted Quotes.');
    }
  });
});

describe('getProductDocuments and readProductDocument', () => {
  test('lists by owner and reads stored bytes', async ({ context }) => {
    const first = await uploadPdf(context, { filename: 'A.pdf', productId: context.productId, type: 'sop' });
    await uploadPdf(context, { filename: 'B.pdf', productId: context.otherProductId });

    await expect(
      getProductDocuments({
        db: context.db,
        productId: context.productId,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: first.id, filename: 'A.pdf', metadata: { type: 'sop' } })]);

    const read = await readProductDocument({
      db: context.db,
      documentId: first.id,
      productId: context.productId,
      storage: context.storage,
    });

    expect(read.document).toMatchObject({ contentType: 'application/pdf', id: first.id, filename: 'A.pdf' });
    await expect(readAll(read.object.body)).resolves.toEqual(pdfBytes());
  });

  test('serves the persisted verified content type when storage metadata differs', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'A.pdf', productId: context.productId });
    const [row] = await context.db.select().from(documents);
    const stored = context.storage.objects.get(row?.storageKey ?? '');

    if (!stored) {
      throw new Error('Expected uploaded object to exist');
    }

    stored.contentType = 'application/octet-stream';

    const read = await readProductDocument({
      db: context.db,
      documentId: document.id,
      productId: context.productId,
      storage: context.storage,
    });

    expect(read.document.contentType).toBe('application/pdf');
    expect(read.object.contentType).toBe('application/octet-stream');
  });

  test('treats soft-removed Product document reads as Product not found', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'Removed.pdf', productId: context.productId });
    await context.db
      .update(products)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(products.id, context.productId));

    await expect(
      readProductDocument({
        db: context.db,
        documentId: document.id,
        productId: context.productId,
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  test('reads job-owned snapshot document bytes', async ({ context }) => {
    const job = await createJobOwner(context.db, context.productId);
    await context.storage.put({
      body: pdfBytes(),
      byteSize: pdfBytes().byteLength,
      contentType: 'application/pdf',
      key: 'documents/product/source/job-part-book.pdf',
    });
    const [snapshot] = await context.db
      .insert(documents)
      .values({
        byteSize: pdfBytes().byteLength,
        contentType: 'application/pdf',
        filename: 'Job Part Book.pdf',
        jobId: job.id,
        metadata: { type: 'part_book' },
        ownerType: 'job',
        sourceProductId: context.productId,
        storageKey: 'documents/product/source/job-part-book.pdf',
        uploaderUserId: ACTOR_USER_ID,
      })
      .returning();
    if (!snapshot) throw new Error('Document insert did not return a row');

    const read = await readJobDocument({
      db: context.db,
      documentId: snapshot.id,
      jobId: job.id,
      storage: context.storage,
    });

    expect(read.document).toMatchObject({
      filename: 'Job Part Book.pdf',
      jobId: job.id,
      ownerType: 'job',
      productId: null,
      sourceProductId: context.productId,
    });
    await expect(readAll(read.object.body)).resolves.toEqual(pdfBytes());
  });

  test('lists quote-owned documents newest first and reads stored bytes', async ({ context }) => {
    const older = await uploadQuotePdf(context, {
      filename: 'Quote Revision 1.pdf',
      quoteId: context.quoteId,
      revision: 1,
    });
    const newer = await uploadQuotePdf(context, {
      filename: 'Quote Revision 2.pdf',
      quoteId: context.quoteId,
      revision: 2,
    });
    await context.db
      .update(documents)
      .set({ createdAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(documents.id, older.id));
    await context.db
      .update(documents)
      .set({ createdAt: new Date('2026-01-02T00:00:00.000Z') })
      .where(eq(documents.id, newer.id));

    await expect(getQuoteDocuments({ db: context.db, quoteId: context.quoteId })).resolves.toEqual([
      expect.objectContaining({ id: newer.id, metadata: { revision: 2 } }),
      expect.objectContaining({ id: older.id, metadata: { revision: 1 } }),
    ]);

    const read = await readQuoteDocument({
      db: context.db,
      documentId: newer.id,
      quoteId: context.quoteId,
      storage: context.storage,
    });

    expect(read.document).toMatchObject({
      filename: 'Quote Revision 2.pdf',
      ownerType: 'quote',
      quoteId: context.quoteId,
    });
    await expect(readAll(read.object.body)).resolves.toEqual(pdfBytes());
  });

  test('throws DocumentNotFoundError when the product exists but the document does not', async ({ context }) => {
    await expect(
      readProductDocument({
        db: context.db,
        documentId: UNKNOWN_ID,
        productId: context.productId,
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  test('throws DocumentNotFoundError when the document belongs to another product', async ({ context }) => {
    const otherProductDocument = await uploadPdf(context, {
      filename: 'Other.pdf',
      productId: context.otherProductId,
    });

    await expect(
      readProductDocument({
        db: context.db,
        documentId: otherProductDocument.id,
        productId: context.productId,
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  test('throws ProductNotFoundError when the product itself does not exist', async ({ context }) => {
    await expect(
      readProductDocument({
        db: context.db,
        documentId: UNKNOWN_ID,
        productId: UNKNOWN_ID,
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  test('throws DocumentNotFoundError when the job exists but the document does not', async ({ context }) => {
    const job = await createJobOwner(context.db, context.productId);

    await expect(
      readJobDocument({
        db: context.db,
        documentId: UNKNOWN_ID,
        jobId: job.id,
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  test('throws JobNotFoundError when the job itself does not exist', async ({ context }) => {
    await expect(
      readJobDocument({
        db: context.db,
        documentId: UNKNOWN_ID,
        jobId: UNKNOWN_ID,
        storage: context.storage,
      }),
    ).rejects.toBeInstanceOf(JobNotFoundError);
  });
});

describe('deleteProductDocument', () => {
  test('removes the document row, keeps the stored object, and writes a delete audit event', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'Delete Me.pdf', productId: context.productId });
    const [row] = await context.db.select().from(documents);

    await deleteProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      documentId: document.id,
      productId: context.productId,
    });

    await expect(context.db.select().from(documents)).resolves.toEqual([]);
    await expect(context.storage.get(row?.storageKey ?? '')).resolves.toMatchObject({
      byteSize: pdfBytes().byteLength,
      contentType: 'application/pdf',
    });

    const events = await context.db.select().from(auditEvents);
    expect(events).toContainEqual(
      expect.objectContaining({
        action: 'deleted',
        actorUserId: ACTOR_USER_ID,
        entityId: document.id,
        entityType: 'document',
        changes: expect.objectContaining({
          byteSize: {
            from: pdfBytes().byteLength,
            to: null,
          },
          contentType: {
            from: 'application/pdf',
            to: null,
          },
          filename: {
            from: 'Delete Me.pdf',
            to: null,
          },
          metadata: {
            from: { type: 'part_book' },
            to: null,
          },
          productId: {
            from: context.productId,
            to: null,
          },
          storageKey: {
            from: row?.storageKey,
            to: null,
          },
        }),
      }),
    );
  });

  test('allows re-uploading the same filename after delete', async ({ context }) => {
    const document = await uploadPdf(context, { filename: 'Part Book.pdf', productId: context.productId });

    await deleteProductDocument({
      actorUserId: ACTOR_USER_ID,
      db: context.db,
      documentId: document.id,
      productId: context.productId,
    });

    await expect(
      uploadPdf(context, { filename: 'part book.PDF', productId: context.productId }),
    ).resolves.toMatchObject({
      filename: 'part book.PDF',
      productId: context.productId,
    });
    expect(context.storage.objects.size).toBe(2);
  });
});

function uploadPdf(
  context: {
    db: Parameters<typeof createProductDocument>[0]['db'];
    storage: InMemoryStorageAdapter;
  },
  input: {
    bytes?: Uint8Array;
    contentType?: string;
    filename: string;
    productId: UUID;
    type?: 'sop' | 'part_book';
  },
) {
  return createProductDocument({
    actorUserId: ACTOR_USER_ID,
    db: context.db,
    input: {
      bytes: input.bytes ?? pdfBytes(),
      contentType: input.contentType ?? 'application/pdf',
      filename: input.filename,
      metadata: { type: input.type ?? 'part_book' },
      productId: input.productId,
    },
    storage: context.storage,
  });
}

// A fake brochure renderer for tests that do not exercise the brochure-merge path (incomplete config or
// blocked generation): it returns canned bytes and must never be reached when the config is incomplete.
const stubBrochureRenderer: BrochurePdfRenderer = async () => realPdfBytes([[420, 420]]);

// Configures every field the completeness gate requires (subtitle, key features, the four image slots,
// a non-empty description) on a Product that already has at least one assembly, so the brochure
// generates from live config. Pass `omitSlots` to leave specific image slots empty and force an
// incomplete verdict.
async function seedCompleteBrochureConfig(
  context: { db: Parameters<typeof createProductDocument>[0]['db']; storage: InMemoryStorageAdapter },
  productId: UUID,
  options: { omitSlots?: ProductImageSlot[] } = {},
): Promise<void> {
  const omit = new Set(options.omitSlots ?? []);
  const images: Record<string, { byteSize: number; contentType: string; storageKey: string; updatedAt: string }> = {};

  for (const slot of BROCHURE_IMAGE_SLOTS) {
    if (omit.has(slot)) {
      continue;
    }

    const body = pngBytes();
    const storageKey = `product-images/product/${productId}/${slot}/seed.png`;
    await context.storage.put({ body, byteSize: body.byteLength, contentType: 'image/png', key: storageKey });
    images[slot] = {
      byteSize: body.byteLength,
      contentType: 'image/png',
      storageKey,
      updatedAt: new Date().toISOString(),
    };
  }

  await context.db
    .update(products)
    .set({
      images,
      keyFeatures: ['Rugged build', 'Low maintenance'],
      category: 'Silage & Grain',
      description: 'A dependable workhorse for the toughest jobs.',
    })
    .where(eq(products.id, productId));
}

function uploadQuotePdf(
  context: {
    db: Parameters<typeof createQuoteDocument>[0]['db'];
    storage: InMemoryStorageAdapter;
  },
  input: { filename: string; quoteId: UUID; revision: number },
) {
  return createQuoteDocument({
    actorUserId: ACTOR_USER_ID,
    db: context.db,
    input: {
      bytes: pdfBytes(),
      filename: input.filename,
      metadata: { revision: input.revision },
      quoteId: input.quoteId,
    },
    storage: context.storage,
  });
}

async function createJobOwner(db: Parameters<typeof readJobDocument>[0]['db'], productId: UUID) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Document Job Customer',
      email: null,
    })
    .returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_USER_ID,
      status: 'accepted',
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  const [job] = await db
    .insert(jobs)
    .values({
      productId,
      productSerialNumber: 'DOC-TEST260001',
      productSerialPrefix: 'DOC-TEST',
      productSerialSequence: 1,
      productSerialYear: 26,
      quoteId: quote.id,
    })
    .returning();
  if (!job) throw new Error('Job insert did not return a row');

  return job;
}

async function createCustomJobOwner(db: Parameters<typeof readJobDocument>[0]['db'], customerId: UUID) {
  const [quote] = await db
    .insert(quotes)
    .values({
      customerId,
      kind: 'custom',
      productId: null,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_USER_ID,
      status: 'draft',
      workTitle: 'Custom fabrication',
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  const [job] = await db.insert(jobs).values({ quoteId: quote.id }).returning();
  if (!job) throw new Error('Job insert did not return a row');

  return job;
}

function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
}

async function realPdfBytes(pageSizes: Array<[number, number]>): Promise<Uint8Array> {
  return createPdfBytesWithPageSizes(pageSizes);
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

async function readAll(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  for await (const chunk of body) {
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}
