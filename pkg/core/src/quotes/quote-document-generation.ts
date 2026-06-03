import { type customers, type Db, documents, type products, quoteSelectedAssemblies, quotes, type user } from '@pkg/db';
import {
  computeQuoteTotal,
  formatCurrency,
  formatPercent,
  QUOTE_DOCUMENT_VAT_PERCENT,
  resolveEffectiveBom,
} from '@pkg/domain';
import { mergePdfBytes } from '@pkg/pdf';
import {
  type AuthId,
  formatQuoteCode,
  type QuoteDocumentGenerationInput,
  type QuoteDocumentGenerationResult,
  type QuoteDocumentLineItem,
  type QuoteDocumentModel,
  type QuoteDocumentPdfRenderer,
  type UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { type DocumentBaseRow, readStoredObjectBytes, selectDocumentBase } from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { createQuoteDocument, getQuoteDocuments } from './quote-document.js';
import { QuoteDocumentGenerationNotAllowedError, QuoteNotFoundError } from './quote-errors.js';
import type { QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

export type QuoteDocumentGenerationRow = typeof quotes.$inferSelect & {
  customer: Pick<
    typeof customers.$inferSelect,
    'address' | 'companyName' | 'contactPerson' | 'email' | 'phone' | 'vatNumber'
  >;
  product: Pick<typeof products.$inferSelect, 'buildTimeDays' | 'currencyCode' | 'modelCode' | 'name'>;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'name'> | null;
  selectedAssemblies: QuoteSelectedAssemblyRow[];
};

type QuoteRow = typeof quotes.$inferSelect;

export async function generateQuoteDocument({
  actorUserId,
  db,
  input,
  pdfRenderer,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteDocumentGenerationInput;
  pdfRenderer: QuoteDocumentPdfRenderer;
  storage: StorageAdapter;
}): Promise<QuoteDocumentGenerationResult> {
  const quote = await getQuoteDocumentGenerationRow({ db, quoteId: input.quoteId });
  assertQuoteDocumentGenerationAllowed(quote);

  const existingDocuments = await getQuoteDocuments({ db, quoteId: input.quoteId });
  const revision =
    existingDocuments.reduce((highest, document) => Math.max(highest, document.metadata.revision), 0) + 1;
  const filename = `${formatQuoteCode(quote.code)}-rev-${revision}.pdf`;
  const document = await getQuoteDocumentModel({ db, input, quote });
  const renderedQuoteBytes = await pdfRenderer({ document, filename });
  const brochure = await getLatestProductPdfBrochure({ db, productId: quote.productId });
  const bytes = brochure
    ? await mergePdfBytes([renderedQuoteBytes, await readStoredObjectBytes(storage, brochure.storageKey)])
    : renderedQuoteBytes;
  const warnings = brochure
    ? []
    : [
        {
          code: 'quote_document.product_brochure_missing' as const,
          message:
            'No PDF brochure is attached to this Quote Product, so the Quote Document was generated without one.',
        },
      ];

  const quoteDocument = await createQuoteDocument({
    actorUserId,
    db,
    input: {
      bytes,
      filename,
      metadata: { revision },
      quoteId: input.quoteId,
    },
    storage,
  });

  return {
    document: quoteDocument,
    warnings,
  };
}

export async function getQuoteDocumentModel({
  db,
  input,
  quote,
}: {
  db: Db;
  input: QuoteDocumentGenerationInput;
  quote: QuoteDocumentGenerationRow;
}): Promise<QuoteDocumentModel> {
  const productAssemblies = await listAssemblies({ productId: quote.productId, tx: db });
  const effectiveBom = resolveEffectiveBom({
    catalogAssemblies: productAssemblies,
    selectedAssemblies: quote.selectedAssemblies,
  });
  const selectedOptionalAssemblies = effectiveBom.selectedOptionalAssemblies.map(({ selection }) => ({
    amount: selection.quotedPrice,
    label: selection.quotedName,
  }));
  const lineItems: QuoteDocumentLineItem[] = [
    {
      amount: quote.quotedBasePrice,
      descriptionLines: [`${quote.product.modelCode} ${quote.product.name}`.trim()],
      kind: 'base',
      quantity: 1,
    },
    ...selectedOptionalAssemblies.map((item) => ({
      amount: item.amount,
      descriptionLines: [item.label],
      kind: 'optional' as const,
      quantity: 1,
    })),
    ...(quote.deliveryIncluded && quote.deliveryPrice > 0
      ? [
          {
            amount: quote.deliveryPrice,
            descriptionLines: ['Delivery'],
            kind: 'charge' as const,
            quantity: 1,
          },
        ]
      : []),
    ...(quote.discountAmount > 0
      ? [
          {
            amount: -quote.discountAmount,
            descriptionLines: ['Discount'],
            kind: 'discount' as const,
            quantity: 1,
          },
        ]
      : []),
  ];
  const subtotal = computeQuoteTotal({
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountAmount: quote.discountAmount,
    quotedBasePrice: quote.quotedBasePrice,
    selectedAssemblyPrices: selectedOptionalAssemblies.map((item) => item.amount),
  });
  const vatAmount = (subtotal * QUOTE_DOCUMENT_VAT_PERCENT) / 100;

  return {
    customer: quote.customer,
    issueDate: quote.createdAt,
    leadTime: input.leadTime,
    lineItems,
    notes: toDisplayLines(quote.documentNotes),
    paymentTerms: `${formatPercent(quote.depositPercent)} deposit`,
    quoteCode: formatQuoteCode(quote.code),
    salesPerson: quote.salesPerson,
    staleSelectionNotes: effectiveBom.staleSelections.map((selection) => `${selection.quotedName} unavailable`),
    subtotal,
    total: subtotal + vatAmount,
    transport: quote.deliveryIncluded
      ? `Included${quote.deliveryPrice > 0 ? ` (${formatCurrency(quote.deliveryPrice, quote.product.currencyCode)})` : ''}`
      : 'Excluded',
    vatAmount,
    currencyCode: quote.product.currencyCode,
  };
}

function toDisplayLines(value: string | null | undefined): string[] {
  return value
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

async function getLatestProductPdfBrochure({
  db,
  productId,
}: {
  db: Db;
  productId: UUID;
}): Promise<Pick<DocumentBaseRow, 'storageKey'> | null> {
  const [row] = await selectDocumentBase(db)
    .where(
      and(
        eq(documents.ownerType, 'product'),
        eq(documents.productId, productId),
        eq(documents.contentType, 'application/pdf'),
        sql`${documents.metadata}->>'type' = 'brochure'`,
      ),
    )
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(1);

  return row ?? null;
}

async function getQuoteDocumentGenerationRow({ db, quoteId }: { db: Db; quoteId: UUID }) {
  const row = await db.query.quotes.findFirst({
    where: eq(quotes.id, quoteId),
    with: {
      customer: {
        columns: {
          address: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
          vatNumber: true,
        },
      },
      product: {
        columns: {
          buildTimeDays: true,
          currencyCode: true,
          modelCode: true,
          name: true,
        },
      },
      salesPerson: {
        columns: {
          email: true,
          name: true,
        },
      },
      selectedAssemblies: {
        orderBy: [asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id)],
      },
    },
  });

  if (!row) {
    throw new QuoteNotFoundError(quoteId);
  }

  return row satisfies QuoteDocumentGenerationRow;
}

function assertQuoteDocumentGenerationAllowed(quote: Pick<QuoteRow, 'status'>): void {
  if (quote.status === 'rejected' || quote.status === 'cancelled') {
    throw new QuoteDocumentGenerationNotAllowedError(
      'Quote Documents can only be generated for draft, sent, or accepted Quotes.',
    );
  }
}
