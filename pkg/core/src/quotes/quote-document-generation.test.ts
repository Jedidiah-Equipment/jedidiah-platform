import { customers, productAssemblies, products, quoteLineItems, quoteSelectedAssemblies, quotes, user } from '@pkg/db';
import { priceQuote } from '@pkg/domain';
import type { BrochurePdfRenderer, QuoteDocumentModel, QuoteDocumentPdfRenderer } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { generateQuoteDocument } from './quote-document-generation.js';

const actorUserId = 'sales-user-id';

const test = createTester(async ({ db }) => {
  const now = new Date();
  const rangeId = await createProductRangeFixture(db);
  const [salesPerson] = await db
    .insert(user)
    .values({
      createdAt: now,
      email: 'sales@example.com',
      emailVerified: true,
      id: actorUserId,
      name: 'Sales User',
      role: 'sales',
      updatedAt: now,
    })
    .returning();
  const [customer] = await db.insert(customers).values({ companyName: 'Acme Mining', email: null }).returning();
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      modelCode: 'QUOTE-DOC-001',
      name: 'Quote Document Product',
      rangeId,
    })
    .returning();

  if (!salesPerson || !customer || !product) {
    throw new Error('Quote document test setup did not return required rows');
  }

  const [firstOptional, secondOptional] = await db
    .insert(productAssemblies)
    .values([
      { displayOrder: 0, kind: 'optional', name: 'Heavy Axle', price: 300, productId: product.id },
      { displayOrder: 1, kind: 'optional', name: 'Long Range Tank', price: 150, productId: product.id },
    ])
    .returning();

  if (!firstOptional || !secondOptional) {
    throw new Error('Quote document test setup did not return assemblies');
  }

  return { customer, firstOptional, product, salesPerson, secondOptional };
});

function captureModelRenderer(captured: { model: QuoteDocumentModel | null }): QuoteDocumentPdfRenderer {
  return async ({ document }) => {
    captured.model = document;
    return new TextEncoder().encode('%PDF-1.7\n%%EOF');
  };
}

const unusedBrochureRenderer: BrochurePdfRenderer = async () => {
  throw new Error('Brochure renderer must not run for an incomplete Brochure Config');
};

describe('getQuoteDocumentModel pricing (through generateQuoteDocument)', () => {
  test('prices the document from the one Quote Pricing seam: catalog-ordered rows, stale notes, VAT', async ({
    context,
  }) => {
    const [quote] = await context.db
      .insert(quotes)
      .values({
        customerId: context.customer.id,
        deliveryIncluded: false,
        deliveryPrice: 350,
        discountPercent: 10,
        productId: context.product.id,
        quotedBasePrice: 1000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: context.salesPerson.id,
        status: 'sent',
      })
      .returning();

    if (!quote) {
      throw new Error('Quote insert did not return a row');
    }

    // Selections inserted in reverse catalog order, plus one stale (nulled) reference.
    await context.db.insert(quoteSelectedAssemblies).values([
      {
        productAssemblyId: context.secondOptional.id,
        quotedName: 'Long Range Tank',
        quotedPrice: 150,
        quoteId: quote.id,
      },
      { productAssemblyId: context.firstOptional.id, quotedName: 'Heavy Axle', quotedPrice: 300, quoteId: quote.id },
      { productAssemblyId: null, quotedName: 'Removed Winch', quotedPrice: 999, quoteId: quote.id },
    ]);
    await context.db
      .insert(quoteLineItems)
      .values([{ name: 'Site training', quantity: 2, unitPrice: 125, quoteId: quote.id }]);

    const captured: { model: QuoteDocumentModel | null } = { model: null };
    const result = await generateQuoteDocument({
      actorUserId,
      brochureRenderer: unusedBrochureRenderer,
      db: context.db,
      input: { leadTime: '14 working days', quoteId: quote.id },
      pdfRenderer: captureModelRenderer(captured),
      storage: new InMemoryStorageAdapter(),
    });
    const model = captured.model;

    if (!model) {
      throw new Error('PDF renderer did not receive a document model');
    }

    // base 1000 + assemblies 450 + line items 250 = 1700; 10% discount = 170; + delivery 350 = 1880.
    expect(model.subtotal).toBe(1880);
    expect(model.vatAmount).toBe(282);
    expect(model.total).toBe(2162);
    expect(model.lineItems.filter((item) => item.kind === 'optional').map((item) => item.descriptionLines)).toEqual([
      ['Heavy Axle'],
      ['Long Range Tank'],
    ]);
    expect(model.lineItems.find((item) => item.kind === 'discount')?.amount).toBe(-170);
    expect(model.staleSelectionNotes).toEqual(['Removed Winch unavailable']);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['quote_document.brochure_config_incomplete']);
  });

  test('agrees with the persisted Quote Pricing seam on the same stored facts', async ({ context }) => {
    const [quote] = await context.db
      .insert(quotes)
      .values({
        customerId: context.customer.id,
        discountPercent: 12.5,
        productId: context.product.id,
        quotedBasePrice: 2000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: context.salesPerson.id,
        status: 'accepted',
      })
      .returning();

    if (!quote) {
      throw new Error('Quote insert did not return a row');
    }

    const selections = [
      { productAssemblyId: context.firstOptional.id, quotedName: 'Heavy Axle', quotedPrice: 300, quoteId: quote.id },
      { productAssemblyId: null, quotedName: 'Removed Winch', quotedPrice: 999, quoteId: quote.id },
    ];
    await context.db.insert(quoteSelectedAssemblies).values(selections);

    const captured: { model: QuoteDocumentModel | null } = { model: null };
    await generateQuoteDocument({
      actorUserId,
      brochureRenderer: unusedBrochureRenderer,
      db: context.db,
      input: { leadTime: '14 working days', quoteId: quote.id },
      pdfRenderer: captureModelRenderer(captured),
      storage: new InMemoryStorageAdapter(),
    });

    const persisted = priceQuote({
      discountPercent: 12.5,
      quotedBasePrice: 2000,
      selectedAssemblies: selections,
    });

    expect(captured.model).toMatchObject({
      subtotal: persisted.subtotal,
      total: persisted.total,
      vatAmount: persisted.vatAmount,
    });
  });
});
