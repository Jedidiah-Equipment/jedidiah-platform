import {
  type DatabaseTransaction,
  type Db,
  invoiceExtractions,
  invoiceFlagResolutions,
  stockMovements,
  user,
} from '@pkg/db';
import { deriveInvoicePriceCorrection, derivePartStockActions } from '@pkg/domain';
import type {
  AuthId,
  InvoiceFlagResolution,
  PurchaseOrderDocumentRow,
  SupplierInvoiceCorrectionInput,
  SupplierInvoiceDismissFlagInput,
  SupplierInvoiceExtraction,
  SupplierInvoiceMatchRow,
  SupplierInvoiceReviewResult,
  UUID,
} from '@pkg/schema';
import {
  InvoiceFlagResolution as InvoiceFlagResolutionSchema,
  SupplierInvoiceReviewResult as SupplierInvoiceReviewResultSchema,
} from '@pkg/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { assertDocumentAcceptable } from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { insertMovement, loadMovingAverages, loadStockPart } from '../inventory/ledger.js';
import { assertPartStockAction } from '../inventory/part-stock-action-errors.js';
import { filePurchaseOrderDocument } from './purchase-order-document-filing.js';
import { PurchaseOrderNotSentError } from './purchase-order-errors.js';
import { getPurchaseOrder, type PurchaseOrderDb } from './purchase-order-service.js';
import {
  InvoiceFlagAlreadyResolvedError,
  InvoiceFlagNotFoundError,
  InvoicePriceNotApplicableError,
  SupplierInvoiceNotFoundError,
} from './supplier-invoice-errors.js';
import {
  loadInvoiceDocuments,
  loadResolutions,
  type MatchOrderLine,
  matchInvoiceRows,
} from './supplier-invoice-matching.js';

/**
 * The Supplier invoice cross-check (spec §5).
 *
 * Three facts, kept apart on purpose. The **document** is the invoice PDF, filed into the order's
 * own collection like the credit note beside it. The **extraction** is one AI read of that PDF,
 * stored once and re-runnable — and explicitly allowed to have failed, because an unreadable
 * invoice is a supported outcome, not an error. The **match** is stored nowhere at all: it is
 * recomputed against the order's *current* lines on every read, so an amendment agreeing a price
 * (#1055) makes the flag go away by itself instead of leaving a stale one behind.
 *
 * Nothing here writes the ledger on its own. A revaluation is only ever posted by the click that
 * confirms one flagged line, which is the human confirmation the spec asks for.
 */

/** Injected so `@pkg/core` keeps its distance from the AI SDK; `@pkg/ai` is a consumer, not a dependency. */
export type SupplierInvoiceExtractor = (input: {
  bytes: Uint8Array;
  contentType: string;
}) => Promise<SupplierInvoiceExtraction>;

/**
 * Files a Supplier invoice against an order and records what an AI read off it, in one transaction.
 *
 * The extraction runs *before* the writes and never throws outward: a provider that is down, slow,
 * or confused files a row with no extraction, which the panel reports as an invoice it could not
 * read. The upload is retained and nothing is blocked — an AI failure may never cost the desk its
 * document (spec §5).
 */
export async function uploadSupplierInvoice({
  actorUserId,
  bytes,
  db,
  extract,
  filename,
  input,
  onExtractionError,
  storage,
}: {
  actorUserId: AuthId;
  bytes: Uint8Array;
  db: Db;
  extract: SupplierInvoiceExtractor;
  filename: string;
  input: { purchaseOrderId: UUID };
  /**
   * Where a failed read goes. The panel only ever says "couldn't read this invoice", which is the
   * right thing to tell the desk and useless to whoever has to find out why — so the reason is
   * handed out here rather than swallowed.
   */
  onExtractionError?: (error: unknown) => void;
  storage: StorageAdapter;
}): Promise<PurchaseOrderDocumentRow> {
  const purchaseOrder = await getPurchaseOrder({ db, id: input.purchaseOrderId });
  // Only an order the Supplier is actually holding can have been invoiced. A draft has not been
  // sent and a cancelled one was called off, so a bill against either describes nothing — and the
  // browser's own check of this is UX, never the boundary (`pkg/web/AGENTS.md`). Closed-short
  // orders still qualify: closing short says nothing more is coming, not that nothing arrived.
  if (purchaseOrder.status !== 'sent') throw new PurchaseOrderNotSentError(input.purchaseOrderId);

  // Validated against the *sniffed* bytes rather than the multipart content type, and before the
  // model is called: filing would refuse a spoofed PDF anyway, but only after this function had
  // already sent its bytes to a third-party provider. What a file claims to be is not a reason to
  // disclose it, so the same gate filing applies runs first, here.
  const verifiedContentType = assertDocumentAcceptable({
    bytes,
    metadata: { type: 'supplier_invoice' },
    ownerType: 'purchase_order',
  });

  const extraction = await readInvoice({
    bytes,
    contentType: verifiedContentType,
    extract,
    onError: onExtractionError,
  });

  return filePurchaseOrderDocument({
    actorUserId,
    bytes,
    db,
    filename,
    metadata: { type: 'supplier_invoice' },
    purchaseOrderId: input.purchaseOrderId,
    storage,
    writeReferences: async (tx, document) => {
      await tx
        .insert(invoiceExtractions)
        .values({ documentId: document.id, extraction })
        // Re-reading the same document replaces the earlier attempt rather than failing: the read is
        // the disposable half of this pair, and the PDF it read is not.
        .onConflictDoUpdate({ set: { extraction }, target: invoiceExtractions.documentId });
    },
  });
}

/** Every Supplier invoice on an order, each cross-checked against the order as it stands now. */
export async function loadSupplierInvoiceReviews({
  db,
  documentId,
  purchaseOrderId,
}: {
  db: PurchaseOrderDb;
  /** Narrows the read to one invoice. A mutation answering for one flag needs no more than that. */
  documentId?: UUID;
  purchaseOrderId: UUID;
}): Promise<SupplierInvoiceReviewResult> {
  const purchaseOrder = await getPurchaseOrder({ db, id: purchaseOrderId });
  const invoices = await loadInvoiceDocuments(db, { ...(documentId ? { documentId } : {}), purchaseOrderId });
  if (invoices.length === 0) return { items: [] };

  const orderLines = purchaseOrder.lines.map((line) => ({
    orderedQuantity: line.quantity,
    partCode: line.partCode,
    partId: line.partId,
    partName: line.partName,
    supplierCode: line.supplierCode ?? null,
    unitPrice: line.unitPrice,
  }));
  const [bases, resolutions] = await Promise.all([
    loadPriceCorrectionBases({ db, orderLines, purchaseOrderId }),
    loadResolutions(
      db,
      invoices.map((invoice) => invoice.documentId),
    ),
  ]);

  return SupplierInvoiceReviewResultSchema.parse({
    items: invoices.map((invoice) => {
      const extraction = invoice.extraction;
      const answered = resolutions.get(invoice.documentId);
      const rows = extraction
        ? matchInvoiceRows({ extraction, orderLines, resolutions: answered }).map(({ answer, priceFlag, row }) => {
            const basis = row.partId === null ? undefined : bases.get(row.partId);

            return {
              ...row,
              // A correction is an offer, and the offer is withdrawn once the flag has been answered.
              // The receipts stay stamped at what they were stamped at, so an already-applied flag
              // would otherwise keep offering to move the average by the same difference again.
              correction:
                priceFlag && !answer && basis
                  ? deriveInvoicePriceCorrection({ ...basis, invoicedUnitCost: row.invoiceUnitPrice })
                  : null,
            };
          })
        : [];

      return {
        documentId: invoice.documentId,
        extractedAt: invoice.extractedAt ?? invoice.createdAt,
        filename: invoice.filename,
        invoiceDate: extraction?.invoiceDate ?? null,
        invoiceNumber: extraction?.invoiceNumber ?? null,
        jobCodes: collectJobCodes(extraction),
        readable: extraction !== null,
        resolutions: Object.fromEntries(answered ?? []),
        rows,
        uploaderName: invoice.uploaderName,
      };
    }),
  });
}

/**
 * Confirms one invoiced price and heals the Part's average with a `revaluation` (spec §5).
 *
 * The flag is recomputed inside the transaction rather than trusted from the click: the panel the
 * user was looking at may be minutes old, and an amendment or a draw since then changes both
 * whether there is anything to correct and what the correction would be.
 */
export async function applyInvoicePrice({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: SupplierInvoiceCorrectionInput;
}): Promise<InvoiceFlagResolution> {
  return db.transaction(async (tx) => {
    // The same Part read every ledger writer takes, under the same lock, so the average this reads
    // is the average the revaluation lands on — and so this path is held to the same Part rules.
    const part = await loadStockPart({ db: tx, lockForMovement: true, partId: input.partId });

    const { flag, row } = await requireFlaggedRow(tx, {
      documentId: input.documentId,
      kind: 'price-mismatch',
      partId: input.partId,
      purchaseOrderId: input.purchaseOrderId,
    });
    if (!row.correction?.canApply || row.correction.newAverageUnitCost === null) {
      throw new InvoicePriceNotApplicableError(input.partId);
    }
    // `postRevaluation` opens its own transaction, so this path appends the row itself — but it is
    // held to the same rule: a Built Part's cost is derived from its build and never keyed, whatever
    // a Supplier's paperwork says (spec §5). A Part flipped to internally-fabricated after its
    // receipts is exactly how an invoiced price would otherwise reach one.
    assertPartStockAction(derivePartStockActions(part).revalue, { partId: input.partId });

    const movement = await insertMovement(tx, {
      actorUserId,
      delta: 0,
      movementType: 'revaluation',
      note: `Supplier invoice price confirmed: ${formatNote(row)}`,
      partId: input.partId,
      unitCost: row.correction.newAverageUnitCost,
    });

    return recordResolution(tx, {
      actorUserId,
      documentId: input.documentId,
      flagKey: flag.key,
      kind: 'applied',
      stockMovementId: movement.id,
    });
  });
}

/** Sets one flag aside for good. No ledger write — a dismissal is a judgment, not a correction. */
export async function dismissInvoiceFlag({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: SupplierInvoiceDismissFlagInput;
}): Promise<InvoiceFlagResolution> {
  return db.transaction(async (tx) => {
    const review = await requireReview(tx, {
      documentId: input.documentId,
      purchaseOrderId: input.purchaseOrderId,
    });

    const known = review.rows.some((row) => row.flags.some((flag) => flag.key === input.flagKey));
    if (!known) throw new InvoiceFlagNotFoundError(input.flagKey);

    return recordResolution(tx, {
      actorUserId,
      documentId: input.documentId,
      flagKey: input.flagKey,
      kind: 'dismissed',
      stockMovementId: null,
    });
  });
}

/**
 * What confirming each line's invoiced price would do to its Part's average.
 *
 * The receipts are read per order line rather than per Part: the correction answers for the value
 * *this* delivery brought in, and the same Part bought twice at two prices must not have one
 * order's mistake spread over the other's stock.
 */
/**
 * Everything a price correction is computed from except the invoiced price itself, which belongs to
 * the matched invoice line rather than to the order line and so is not known until the match is.
 */
type PriceCorrectionBasis = Omit<Parameters<typeof deriveInvoicePriceCorrection>[0], 'invoicedUnitCost'>;

async function loadPriceCorrectionBases({
  db,
  orderLines,
  purchaseOrderId,
}: {
  db: PurchaseOrderDb;
  orderLines: readonly MatchOrderLine[];
  purchaseOrderId: UUID;
}): Promise<Map<string, PriceCorrectionBasis>> {
  const partIds = orderLines.map((line) => line.partId);
  if (partIds.length === 0) return new Map();

  const [averages, receipts, onHand] = await Promise.all([
    loadMovingAverages(db, partIds),
    db
      .select({
        partId: stockMovements.partId,
        quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
        value: sql<number>`coalesce(sum(${stockMovements.delta} * coalesce(${stockMovements.unitCost}, 0)), 0)::double precision`,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.purchaseOrderId, purchaseOrderId),
          eq(stockMovements.movementType, 'receipt'),
          inArray(stockMovements.partId, partIds),
        ),
      )
      .groupBy(stockMovements.partId),
    // Summed in the unit the moving average is expressed per: a linear Part's average is per
    // millimetre, so its stock on hand has to be too, or the correction divides pieces into a
    // per-millimetre figure. A revaluation moves cost and never quantity, so it is excluded exactly
    // as `loadBucketQuantities` excludes it.
    db
      .select({
        basisQuantity: sql<number>`coalesce(sum(${stockMovements.delta} * coalesce(${stockMovements.lengthMm}, 1)), 0)::double precision`,
        partId: stockMovements.partId,
      })
      .from(stockMovements)
      .where(and(inArray(stockMovements.partId, partIds), sql`${stockMovements.movementType} <> 'revaluation'`))
      .groupBy(stockMovements.partId),
  ]);
  const receiptsByPart = new Map(receipts.map((row) => [row.partId, row]));
  const onHandByPart = new Map(onHand.map((row) => [row.partId, row.basisQuantity]));

  return new Map(
    orderLines.map((line) => {
      const receipt = receiptsByPart.get(line.partId);
      const receivedQuantity = receipt?.quantity ?? 0;

      return [
        line.partId,
        {
          averageUnitCost: averages.get(line.partId) ?? null,
          // Quantity-weighted: two receipts on one line at two prices are one blended cost, which is
          // exactly what the average already carries.
          receiptedUnitCost: receivedQuantity > 0 && receipt ? receipt.value / receivedQuantity : null,
          receivedQuantity,
          stockOnHandBasis: onHandByPart.get(line.partId) ?? 0,
        },
      ];
    }),
  );
}

/**
 * The one invoice a mutation is answering for, cross-checked against the order as it stands inside
 * this transaction. Never trusted from the click: the panel the user was looking at may be minutes
 * old, and an amendment or a draw since then changes what is flagged and what a correction would do.
 */
async function requireReview(tx: DatabaseTransaction, { documentId, purchaseOrderId }: SupplierInvoiceRef) {
  const reviews = await loadSupplierInvoiceReviews({ db: tx, documentId, purchaseOrderId });
  const review = reviews.items.find((item) => item.documentId === documentId);
  if (!review) throw new SupplierInvoiceNotFoundError(documentId);

  return review;
}

type SupplierInvoiceRef = { documentId: UUID; purchaseOrderId: UUID };

/** The one flag of a given kind on a given Part, recomputed now — or a refusal saying it is gone. */
async function requireFlaggedRow(
  tx: DatabaseTransaction,
  { documentId, kind, partId, purchaseOrderId }: SupplierInvoiceRef & { kind: 'price-mismatch'; partId: UUID },
) {
  const review = await requireReview(tx, { documentId, purchaseOrderId });

  const row = review.rows.find((candidate) => candidate.partId === partId);
  const flag = row?.flags.find((candidate) => candidate.kind === kind);
  if (!row || !flag) throw new InvoiceFlagNotFoundError(`${kind}:${partId}`);
  // Checked before the correction, so a second click reads as the repeat it is rather than as a
  // correction that has stopped being possible.
  if (review.resolutions[flag.key]) throw new InvoiceFlagAlreadyResolvedError(flag.key);

  return { flag, row };
}

async function recordResolution(
  tx: DatabaseTransaction,
  values: {
    actorUserId: AuthId;
    documentId: UUID;
    flagKey: string;
    kind: 'applied' | 'dismissed';
    stockMovementId: UUID | null;
  },
): Promise<InvoiceFlagResolution> {
  const [inserted] = await tx
    .insert(invoiceFlagResolutions)
    .values(values)
    // One flag takes one decision. Doing nothing rather than overwriting is what makes a double
    // click harmless, and the empty result is what tells the caller it was already answered.
    .onConflictDoNothing()
    .returning({ createdAt: invoiceFlagResolutions.createdAt });
  if (!inserted) throw new InvoiceFlagAlreadyResolvedError(values.flagKey);

  const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, values.actorUserId));

  return InvoiceFlagResolutionSchema.parse({
    actorName: actor?.name ?? null,
    createdAt: inserted.createdAt.toISOString(),
    kind: values.kind,
    stockMovementId: values.stockMovementId,
  });
}

/** An unreadable invoice is a supported outcome; only the upload itself may fail this flow. */
async function readInvoice({
  bytes,
  contentType,
  extract,
  onError,
}: {
  bytes: Uint8Array;
  contentType: string;
  extract: SupplierInvoiceExtractor;
  onError: ((error: unknown) => void) | undefined;
}): Promise<SupplierInvoiceExtraction | null> {
  try {
    return await extract({ bytes, contentType });
  } catch (error) {
    // Degrading to an unreadable invoice is the contract (spec §5) — losing the reason it failed
    // is not. An operator with a configured key and an empty panel has nothing else to go on.
    onError?.(error);

    return null;
  }
}

function collectJobCodes(extraction: SupplierInvoiceExtraction | null): string[] {
  if (!extraction) return [];

  return [...new Set([...extraction.jobCodes, ...extraction.lines.flatMap((line) => line.jobCodes)])];
}

/** What the revaluation's note says it answered, so the ledger row explains itself years later. */
function formatNote(row: SupplierInvoiceMatchRow): string {
  return `${row.partCode ?? row.description} invoiced at ${row.invoiceUnitPrice}, ordered at ${row.unitPrice}`;
}
