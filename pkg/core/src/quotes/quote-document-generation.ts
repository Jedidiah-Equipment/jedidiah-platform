import {
  type customers,
  type Db,
  type products,
  quoteLineItems,
  quoteSelectedAssemblies,
  quotes,
  type user,
} from '@pkg/db';
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
  type BrochurePdfRenderer,
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
import { asc, eq } from 'drizzle-orm';

import type { StorageAdapter } from '../documents/storage-adapter.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { generateProductBrochureIfComplete } from '../products/product-brochure-document.js';
import { createQuoteDocument, getQuoteDocuments } from './quote-document.js';
import { QuoteDocumentGenerationNotAllowedError, QuoteNotFoundError } from './quote-errors.js';
import type { QuoteLineItemRow } from './quote-line-items.js';
import type { QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

export type QuoteDocumentGenerationRow = typeof quotes.$inferSelect & {
  customer: Pick<
    typeof customers.$inferSelect,
    'address' | 'companyName' | 'contactPerson' | 'email' | 'phone' | 'vatNumber'
  >;
  product: Pick<typeof products.$inferSelect, 'buildTimeDays' | 'currencyCode' | 'modelCode' | 'name'>;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'name' | 'phoneNumber'> | null;
  lineItems: QuoteLineItemRow[];
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
  brochureRenderer,
  db,
  input,
  pdfRenderer,
  storage,
}: {
  brochureRenderer: BrochurePdfRenderer;
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
  const brochure = await generateProductBrochureIfComplete({
    db,
    pdfRenderer: brochureRenderer,
    productId: quote.productId,
    storage,
  });
  const packet = await buildQuoteDocumentPacket({ brochure, renderedQuoteBytes });

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
  brochureRenderer,
  db,
  input,
  pdfRenderer,
  storage,
}: {
  actorUserId: AuthId;
  brochureRenderer: BrochurePdfRenderer;
  db: Db;
  input: QuoteDocumentGenerationInput;
  pdfRenderer: QuoteDocumentPdfRenderer;
  storage: StorageAdapter;
}): Promise<QuoteDocumentGenerationResult> {
  const draft = await renderQuoteDocumentRevision({ brochureRenderer, db, input, pdfRenderer, storage });
  const document = await persistQuoteDocumentRevision({ actorUserId, db, draft, quoteId: input.quoteId, storage });

  return {
    document,
    warnings: draft.warnings,
  };
}

async function buildQuoteDocumentPacket({
  brochure,
  renderedQuoteBytes,
}: {
  brochure: { bytes: Uint8Array } | null;
  renderedQuoteBytes: Uint8Array;
}): Promise<{ bytes: Uint8Array; warnings: QuoteDocumentGenerationWarning[] }> {
  if (!brochure) {
    return {
      bytes: renderedQuoteBytes,
      warnings: [
        {
          code: 'quote_document.brochure_config_incomplete',
          message:
            "This Quote Product's Brochure is not fully configured, so the Quote Document was generated without one.",
        },
      ],
    };
  }

  return {
    bytes: await mergePdfBytes([renderedQuoteBytes, brochure.bytes]),
    warnings: [],
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
  const liveSelections = effectiveBom.selectedOptionalAssemblies.map(({ selection }) => selection);
  const selectedOptionalAssemblies = liveSelections.map((selection) => ({
    amount: selection.quotedPrice,
    label: selection.quotedName,
  }));
  const freeformLineItems = quote.lineItems.map((item) => ({
    amount: item.quantity * item.unitPrice,
    descriptionLines: [formatQuoteDocumentLineItemDescription(item)],
    kind: 'lineItem' as const,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
  // Optional rows and their money both come from the catalog-resolved live set, so a selection that
  // goes stale by any rule drops from the PDF rows and the subtotal together. Freeform line items
  // never have catalog staleness, so they always remain in the discountable subtotal.
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
    ...freeformLineItems,
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
      ? `Included${quote.deliveryPrice > 0 ? ` (${formatCurrency(quote.deliveryPrice, quote.quotedCurrencyCode)})` : ''}`
      : 'Excluded',
    vatAmount,
    currencyCode: quote.quotedCurrencyCode,
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
      lineItems: {
        orderBy: [asc(quoteLineItems.createdAt), asc(quoteLineItems.id)],
      },
    },
  });

  if (!row) {
    throw new QuoteNotFoundError(quoteId);
  }

  return row satisfies QuoteDocumentGenerationRow;
}

function formatQuoteDocumentLineItemDescription(item: Pick<QuoteLineItemRow, 'name' | 'quantity'>): string {
  return item.quantity === 1 ? item.name : `${item.quantity} x ${item.name}`;
}

function assertQuoteDocumentGenerationAllowed(quote: Pick<QuoteRow, 'status'>): void {
  if (quote.status === 'rejected' || quote.status === 'cancelled') {
    throw new QuoteDocumentGenerationNotAllowedError(
      'Quote Documents can only be generated for draft, sent, or accepted Quotes.',
    );
  }
}
