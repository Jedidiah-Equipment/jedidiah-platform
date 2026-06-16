import { type customers, type Db, documents, type products, quoteSelectedAssemblies, quotes, type user } from '@pkg/db';
import {
  formatCurrency,
  formatPercent,
  priceQuoteFromLiveSelections,
  QUOTE_DOCUMENT_VAT_PERCENT,
  resolveEffectiveBom,
} from '@pkg/domain';
import { mergePdfBytes } from '@pkg/pdf';
import {
  type AuthId,
  formatQuoteCode,
  type QuoteDocument,
  type QuoteDocumentGenerationInput,
  type QuoteDocumentGenerationResult,
  type QuoteDocumentGenerationWarning,
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
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'name' | 'phoneNumber'> | null;
  selectedAssemblies: QuoteSelectedAssemblyRow[];
};

type QuoteRow = typeof quotes.$inferSelect;

export type QuoteDocumentRevisionDraft = {
  bytes: Uint8Array;
  filename: string;
  revision: number;
  warnings: QuoteDocumentGenerationWarning[];
};

/**
 * Renders the next Quote Document revision (PDF bytes + brochure merge) WITHOUT persisting it. Use this
 * when the revision should only be stored after a dependent step succeeds — e.g. Draft Email, which must
 * not leave an orphan revision when AI generation or email delivery fails. Pair with
 * `persistQuoteDocumentRevision` once the dependent work is done.
 */
export async function renderQuoteDocumentRevision({
  db,
  input,
  pdfRenderer,
  storage,
}: {
  db: Db;
  input: QuoteDocumentGenerationInput;
  pdfRenderer: QuoteDocumentPdfRenderer;
  storage: StorageAdapter;
}): Promise<QuoteDocumentRevisionDraft> {
  const quote = await getQuoteDocumentGenerationRow({ db, quoteId: input.quoteId });
  assertQuoteDocumentGenerationAllowed(quote);

  const existingDocuments = await getQuoteDocuments({ db, quoteId: input.quoteId });
  const revision =
    existingDocuments.reduce((highest, document) => Math.max(highest, document.metadata.revision), 0) + 1;
  const filename = `${formatQuoteCode(quote.code)}-rev-${revision}.pdf`;
  const document = await getQuoteDocumentModel({ db, input, quote });
  const renderedQuoteBytes = await pdfRenderer({ document, filename });
  const brochure = await getLatestProductPdfBrochure({ db, productId: quote.productId });
  const packet = await buildQuoteDocumentPacket({
    brochure,
    renderedQuoteBytes,
    storage,
  });

  return {
    bytes: packet.bytes,
    filename,
    revision,
    warnings: packet.warnings,
  };
}

export async function persistQuoteDocumentRevision({
  actorUserId,
  db,
  draft,
  quoteId,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  draft: QuoteDocumentRevisionDraft;
  quoteId: UUID;
  storage: StorageAdapter;
}): Promise<QuoteDocument> {
  return createQuoteDocument({
    actorUserId,
    db,
    input: {
      bytes: draft.bytes,
      filename: draft.filename,
      metadata: { revision: draft.revision },
      quoteId,
    },
    storage,
  });
}

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
  const draft = await renderQuoteDocumentRevision({ db, input, pdfRenderer, storage });
  const document = await persistQuoteDocumentRevision({ actorUserId, db, draft, quoteId: input.quoteId, storage });

  return {
    document,
    warnings: draft.warnings,
  };
}

async function buildQuoteDocumentPacket({
  brochure,
  renderedQuoteBytes,
  storage,
}: {
  brochure: Pick<DocumentBaseRow, 'storageKey'> | null;
  renderedQuoteBytes: Uint8Array;
  storage: StorageAdapter;
}): Promise<{ bytes: Uint8Array; warnings: QuoteDocumentGenerationWarning[] }> {
  if (!brochure) {
    return {
      bytes: renderedQuoteBytes,
      warnings: [
        {
          code: 'quote_document.product_brochure_missing',
          message:
            'No PDF brochure is attached to this Quote Product, so the Quote Document was generated without one.',
        },
      ],
    };
  }

  try {
    return {
      bytes: await mergePdfBytes([renderedQuoteBytes, await readStoredObjectBytes(storage, brochure.storageKey)]),
      warnings: [],
    };
  } catch {
    return {
      bytes: renderedQuoteBytes,
      warnings: [
        {
          code: 'quote_document.product_brochure_unavailable',
          message: 'The latest PDF brochure could not be appended, so the Quote Document was generated without one.',
        },
      ],
    };
  }
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
  const liveSelections = effectiveBom.selectedOptionalAssemblies.map(({ selection }) => selection);
  const selectedOptionalAssemblies = liveSelections.map((selection) => ({
    amount: selection.quotedPrice,
    label: selection.quotedName,
  }));
  // Line items and the money both come from the catalog-resolved live set, so a selection that goes
  // stale by any rule (null FK, deleted Assembly, or an Assembly flipped to Standard) drops from the
  // line items and the subtotal together — the PDF total always matches its line items.
  const pricing = priceQuoteFromLiveSelections(quote, liveSelections);
  const discountAmount = pricing.discountAmount;
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
    ...(discountAmount > 0
      ? [
          {
            amount: -discountAmount,
            descriptionLines: [`Discount (${formatPercent(quote.discountPercent)})`],
            kind: 'discount' as const,
            quantity: 1,
          },
        ]
      : []),
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
  ];
  const subtotal = pricing.total;
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
          phoneNumber: true,
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
