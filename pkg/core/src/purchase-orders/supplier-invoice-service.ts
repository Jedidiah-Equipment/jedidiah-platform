import {
  type DatabaseTransaction,
  type Db,
  documents,
  getUniqueViolationConstraint,
  invoiceExtractions,
  invoiceFlagResolutions,
  parts,
  purchaseOrderLines,
  purchaseOrders,
  stockMovements,
  supplier,
  user,
} from '@pkg/db';
import { deriveInvoicePriceCorrection, matchInvoiceLines, validateDocumentPolicy } from '@pkg/domain';
import type {
  AuthId,
  InvoiceFlagResolution,
  InvoicePriceCorrection,
  InvoicePriceVarianceResult,
  PurchaseOrderDocumentRow,
  SupplierInvoiceCorrectionInput,
  SupplierInvoiceDismissFlagInput,
  SupplierInvoiceExtraction,
  SupplierInvoiceMatchRow,
  SupplierInvoiceReviewResult,
  UUID,
} from '@pkg/schema';
import {
  InvoicePriceVarianceResult as InvoicePriceVarianceResultSchema,
  SupplierInvoiceExtraction as SupplierInvoiceExtractionSchema,
  SupplierInvoiceReviewResult as SupplierInvoiceReviewResultSchema,
} from '@pkg/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { DocumentPolicyViolationError, DuplicateDocumentFilenameError } from '../documents/document-errors.js';
import { collectDocumentErrorText, createDocumentRecord, mapDocumentSummary } from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { insertMovement, loadMovingAverages } from '../inventory/ledger.js';
import {
  getPurchaseOrder,
  newestPurchaseOrderDocumentFirst,
  type PurchaseOrderDb,
  purchaseOrderDocumentStorageKey,
} from './purchase-order-service.js';
import {
  InvoiceFlagAlreadyResolvedError,
  InvoiceFlagNotFoundError,
  InvoicePriceNotApplicableError,
  SupplierInvoiceNotFoundError,
} from './supplier-invoice-errors.js';

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
  contentType,
  db,
  extract,
  filename,
  input,
  storage,
}: {
  actorUserId: AuthId;
  bytes: Uint8Array;
  contentType: string;
  db: Db;
  extract: SupplierInvoiceExtractor;
  filename: string;
  input: { purchaseOrderId: UUID };
  storage: StorageAdapter;
}): Promise<PurchaseOrderDocumentRow> {
  await getPurchaseOrder({ db, id: input.purchaseOrderId });
  // `createDocumentRecord` re-checks this against the sniffed bytes; checking here too is what stops
  // a rejected upload from spending a model call on its way to being refused.
  const policyResult = validateDocumentPolicy({
    byteSize: bytes.byteLength,
    contentType,
    metadata: { type: 'supplier_invoice' },
    ownerType: 'purchase_order',
  });
  if (!policyResult.ok) throw new DocumentPolicyViolationError(policyResult);

  const extraction = await readInvoice({ bytes, contentType, extract });
  const storageKey = purchaseOrderDocumentStorageKey(input.purchaseOrderId, filename);

  try {
    return await db.transaction(async (tx) => {
      const document = await createDocumentRecord({
        actorUserId,
        db: tx,
        input: {
          bytes,
          filename,
          metadata: { type: 'supplier_invoice' },
          ownerType: 'purchase_order',
          purchaseOrderId: input.purchaseOrderId,
          storageKey,
        },
        mapInsertError: (error) =>
          mapPurchaseOrderDocumentUniqueViolation(error, { filename, purchaseOrderId: input.purchaseOrderId }),
        storage,
      });

      await tx
        .insert(invoiceExtractions)
        .values({ documentId: document.id, extraction })
        // Re-reading the same document replaces the earlier attempt rather than failing: the read is
        // the disposable half of this pair, and the PDF it read is not.
        .onConflictDoUpdate({ set: { extraction }, target: invoiceExtractions.documentId });

      const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actorUserId));

      return {
        byteSize: document.byteSize,
        createdAt: mapDocumentSummary({ ...document, uploaderEmail: null, uploaderName: null }).createdAt,
        filename: document.filename,
        id: document.id,
        revision: null,
        settledReturnIds: [],
        type: 'supplier_invoice' as const,
        uploaderName: actor?.name ?? null,
      };
    });
  } catch (error) {
    // The bytes are stored before the row that points at them, so a failure after that would
    // otherwise leave an object nobody can reach (see the credit-note path).
    try {
      await storage.deleteObject(storageKey);
    } catch {
      // The upload may never have got as far as storing anything; the original failure is the news.
    }

    throw error;
  }
}

/** Every Supplier invoice on an order, each cross-checked against the order as it stands now. */
export async function loadSupplierInvoiceReviews({
  db,
  purchaseOrderId,
}: {
  db: PurchaseOrderDb;
  purchaseOrderId: UUID;
}): Promise<SupplierInvoiceReviewResult> {
  const purchaseOrder = await getPurchaseOrder({ db, id: purchaseOrderId });
  const invoices = await loadInvoiceDocuments(db, purchaseOrderId);
  if (invoices.length === 0) return { items: [] };

  const orderLines = purchaseOrder.lines.map((line) => ({
    orderedQuantity: line.quantity,
    partCode: line.partCode,
    partId: line.partId,
    partName: line.partName,
    supplierCode: line.supplierCode ?? null,
    unitPrice: line.unitPrice,
  }));
  const [corrections, resolutions] = await Promise.all([
    loadPriceCorrections({ db, orderLines, purchaseOrderId }),
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
        ? matchInvoiceLines({ invoiceLines: extraction.lines, orderLines }).map((row) => {
            const priceFlag = row.flags.find((flag) => flag.kind === 'price-mismatch');

            return {
              ...row,
              // A correction is an offer, and the offer is withdrawn once the flag has been answered.
              // The receipts stay stamped at what they were stamped at, so an already-applied flag
              // would otherwise keep offering to move the average by the same difference again.
              correction:
                priceFlag && !answered?.has(priceFlag.key)
                  ? withInvoicedPrice(corrections.get(row.partId ?? ''), row.invoiceUnitPrice)
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
    // The same Part lock every ledger writer takes, so the average this reads is the average the
    // revaluation lands on.
    await tx.select({ id: parts.id }).from(parts).where(eq(parts.id, input.partId)).for('update');

    const { flag, row } = await requireFlaggedRow(tx, {
      documentId: input.documentId,
      kind: 'price-mismatch',
      partId: input.partId,
      purchaseOrderId: input.purchaseOrderId,
    });
    if (!row.correction?.canApply || row.correction.newAverageUnitCost === null) {
      throw new InvoicePriceNotApplicableError(input.partId);
    }

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
    const reviews = await loadSupplierInvoiceReviews({ db: tx, purchaseOrderId: input.purchaseOrderId });
    const review = reviews.items.find((item) => item.documentId === input.documentId);
    if (!review) throw new SupplierInvoiceNotFoundError(input.documentId);

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
 * Every line a Supplier billed at a price the order did not agree, plant-wide (spec §12).
 *
 * Read the same way the panel is — over stored extractions, matched fresh against current lines —
 * so a price somebody has since amended stops showing here without anything being rewritten.
 */
export async function listInvoicePriceVariance({ db }: { db: Db }): Promise<InvoicePriceVarianceResult> {
  const invoices = await loadInvoiceDocuments(db);
  if (invoices.length === 0) return { items: [] };

  const purchaseOrderIds = [...new Set(invoices.map((invoice) => invoice.purchaseOrderId))];
  const [linesByOrder, orders, resolutions] = await Promise.all([
    loadOrderLinesByOrder(db, purchaseOrderIds),
    loadOrderHeaders(db, purchaseOrderIds),
    loadResolutions(
      db,
      invoices.map((invoice) => invoice.documentId),
    ),
  ]);

  const items = invoices.flatMap((invoice) => {
    const order = orders.get(invoice.purchaseOrderId);
    const orderLines = linesByOrder.get(invoice.purchaseOrderId) ?? [];
    if (!invoice.extraction || !order) return [];

    const documentResolutions = resolutions.get(invoice.documentId);

    return matchInvoiceLines({ invoiceLines: invoice.extraction.lines, orderLines }).flatMap((row) => {
      const flag = row.flags.find((candidate) => candidate.kind === 'price-mismatch');
      if (!flag || row.partId === null || row.invoiceUnitPrice === null || row.unitPrice === null) return [];

      const quantity = row.invoiceQuantity ?? row.orderedQuantity ?? 0;

      return [
        {
          documentId: invoice.documentId,
          filename: invoice.filename,
          invoiceNumber: invoice.extraction?.invoiceNumber ?? null,
          invoiceUnitPrice: row.invoiceUnitPrice,
          partCode: row.partCode ?? '',
          partId: row.partId,
          partName: row.partName ?? '',
          purchaseOrderCode: order.code,
          purchaseOrderId: order.id,
          quantity,
          resolution: documentResolutions?.get(flag.key)?.kind ?? null,
          supplierName: order.supplierName,
          unitPrice: row.unitPrice,
          varianceValue: (row.invoiceUnitPrice - row.unitPrice) * quantity,
        },
      ];
    });
  });

  return InvoicePriceVarianceResultSchema.parse({
    // Biggest disagreement first — the money worth arguing about leads the list — with the document
    // and Part breaking a tie, so two identical variances do not swap places between reads.
    items: items.sort(
      (a, b) =>
        Math.abs(b.varianceValue ?? 0) - Math.abs(a.varianceValue ?? 0) ||
        a.documentId.localeCompare(b.documentId) ||
        a.partCode.localeCompare(b.partCode),
    ),
  });
}

type InvoiceDocumentRow = {
  createdAt: Date;
  documentId: UUID;
  extractedAt: Date | null;
  extraction: SupplierInvoiceExtraction | null;
  filename: string;
  purchaseOrderId: UUID;
  uploaderName: string | null;
};

/** The Supplier invoices on one order, or on every order when no order is named. */
async function loadInvoiceDocuments(db: PurchaseOrderDb, purchaseOrderId?: UUID): Promise<InvoiceDocumentRow[]> {
  const isSupplierInvoice = sql`${documents.metadata}->>'type' = 'supplier_invoice'`;
  const rows = await db
    .select({
      createdAt: documents.createdAt,
      documentId: documents.id,
      extractedAt: invoiceExtractions.createdAt,
      extraction: invoiceExtractions.extraction,
      filename: documents.filename,
      purchaseOrderId: documents.purchaseOrderId,
      uploaderName: user.name,
    })
    .from(documents)
    .leftJoin(invoiceExtractions, eq(invoiceExtractions.documentId, documents.id))
    .leftJoin(user, eq(user.id, documents.uploaderUserId))
    .where(
      purchaseOrderId
        ? and(eq(documents.purchaseOrderId, purchaseOrderId), isSupplierInvoice)
        : and(eq(documents.ownerType, 'purchase_order'), isSupplierInvoice),
    )
    .orderBy(newestPurchaseOrderDocumentFirst);

  return rows.flatMap((row) => {
    if (!row.purchaseOrderId) return [];
    // Parsed rather than cast: an extraction written by an older shape of this contract reads as an
    // invoice nobody could make sense of, which is a state the panel already knows how to report.
    const parsed = row.extraction === null ? null : SupplierInvoiceExtractionSchema.safeParse(row.extraction);

    return [{ ...row, extraction: parsed?.success ? parsed.data : null, purchaseOrderId: row.purchaseOrderId }];
  });
}

type MatchOrderLine = {
  orderedQuantity: number;
  partCode: string;
  partId: string;
  partName: string;
  supplierCode: string | null;
  unitPrice: number | null;
};

async function loadOrderLinesByOrder(
  db: PurchaseOrderDb,
  purchaseOrderIds: readonly UUID[],
): Promise<Map<string, MatchOrderLine[]>> {
  const rows = await db
    .select({
      orderedQuantity: purchaseOrderLines.quantity,
      partCode: parts.code,
      partId: purchaseOrderLines.partId,
      partName: parts.name,
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
      supplierCode: parts.supplierCode,
      unitPrice: purchaseOrderLines.unitPrice,
    })
    .from(purchaseOrderLines)
    .innerJoin(parts, eq(parts.id, purchaseOrderLines.partId))
    .where(inArray(purchaseOrderLines.purchaseOrderId, [...purchaseOrderIds]))
    .orderBy(asc(purchaseOrderLines.purchaseOrderId), asc(parts.code));
  const byOrder = new Map<string, MatchOrderLine[]>();

  for (const { purchaseOrderId, ...line } of rows) {
    const lines = byOrder.get(purchaseOrderId);
    if (lines) lines.push(line);
    else byOrder.set(purchaseOrderId, [line]);
  }

  return byOrder;
}

async function loadOrderHeaders(db: PurchaseOrderDb, purchaseOrderIds: readonly UUID[]) {
  const rows = await db
    .select({ code: purchaseOrders.code, id: purchaseOrders.id, supplierName: supplier.companyName })
    .from(purchaseOrders)
    .innerJoin(supplier, eq(supplier.id, purchaseOrders.supplierId))
    .where(inArray(purchaseOrders.id, [...purchaseOrderIds]));

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * What confirming each line's invoiced price would do to its Part's average.
 *
 * The receipts are read per order line rather than per Part: the correction answers for the value
 * *this* delivery brought in, and the same Part bought twice at two prices must not have one
 * order's mistake spread over the other's stock.
 */
async function loadPriceCorrections({
  db,
  orderLines,
  purchaseOrderId,
}: {
  db: PurchaseOrderDb;
  orderLines: readonly MatchOrderLine[];
  purchaseOrderId: UUID;
}): Promise<Map<string, InvoicePriceCorrection>> {
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
        deriveInvoicePriceCorrection({
          averageUnitCost: averages.get(line.partId) ?? null,
          invoicedUnitCost: null,
          // Quantity-weighted: two receipts on one line at two prices are one blended cost, which is
          // exactly what the average already carries.
          receiptedUnitCost: receivedQuantity > 0 && receipt ? receipt.value / receivedQuantity : null,
          receivedQuantity,
          stockOnHandBasis: onHandByPart.get(line.partId) ?? 0,
        }),
      ];
    }),
  );
}

/**
 * The corrections above are computed without an invoiced price, because the price belongs to the
 * matched invoice line rather than to the order line. This folds it in once the match is known.
 */
function withInvoicedPrice(
  correction: InvoicePriceCorrection | undefined,
  invoicedUnitCost: number | null,
): InvoicePriceCorrection | null {
  if (!correction) return null;

  return deriveInvoicePriceCorrection({
    averageUnitCost: correction.averageUnitCost,
    invoicedUnitCost,
    receiptedUnitCost: correction.receiptedUnitCost,
    receivedQuantity: correction.receivedQuantity,
    stockOnHandBasis: correction.stockOnHandBasis,
  });
}

async function loadResolutions(
  db: PurchaseOrderDb,
  documentIds: readonly UUID[],
): Promise<Map<string, Map<string, InvoiceFlagResolution>>> {
  if (documentIds.length === 0) return new Map();

  const rows = await db
    .select({
      actorName: user.name,
      createdAt: invoiceFlagResolutions.createdAt,
      documentId: invoiceFlagResolutions.documentId,
      flagKey: invoiceFlagResolutions.flagKey,
      kind: invoiceFlagResolutions.kind,
      stockMovementId: invoiceFlagResolutions.stockMovementId,
    })
    .from(invoiceFlagResolutions)
    .leftJoin(user, eq(user.id, invoiceFlagResolutions.actorUserId))
    .where(inArray(invoiceFlagResolutions.documentId, [...documentIds]));
  const byDocument = new Map<string, Map<string, InvoiceFlagResolution>>();

  for (const row of rows) {
    const resolution: InvoiceFlagResolution = {
      actorName: row.actorName,
      createdAt: row.createdAt.toISOString() as InvoiceFlagResolution['createdAt'],
      kind: row.kind,
      stockMovementId: row.stockMovementId,
    };
    const forDocument = byDocument.get(row.documentId);
    if (forDocument) forDocument.set(row.flagKey, resolution);
    else byDocument.set(row.documentId, new Map([[row.flagKey, resolution]]));
  }

  return byDocument;
}

/** The one flag of a given kind on a given Part, recomputed now — or a refusal saying it is gone. */
async function requireFlaggedRow(
  tx: DatabaseTransaction,
  {
    documentId,
    kind,
    partId,
    purchaseOrderId,
  }: { documentId: UUID; kind: 'price-mismatch'; partId: UUID; purchaseOrderId: UUID },
) {
  const reviews = await loadSupplierInvoiceReviews({ db: tx, purchaseOrderId });
  const review = reviews.items.find((item) => item.documentId === documentId);
  if (!review) throw new SupplierInvoiceNotFoundError(documentId);

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
  const inserted = await tx
    .insert(invoiceFlagResolutions)
    .values(values)
    // One flag takes one decision. Doing nothing rather than overwriting is what makes a double
    // click harmless, and the empty result is what tells the caller it was already answered.
    .onConflictDoNothing()
    .returning({ createdAt: invoiceFlagResolutions.createdAt });
  if (inserted.length === 0) throw new InvoiceFlagAlreadyResolvedError(values.flagKey);

  const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, values.actorUserId));

  return {
    actorName: actor?.name ?? null,
    createdAt: (inserted[0]?.createdAt ?? new Date()).toISOString() as InvoiceFlagResolution['createdAt'],
    kind: values.kind,
    stockMovementId: values.stockMovementId,
  };
}

/** An unreadable invoice is a supported outcome; only the upload itself may fail this flow. */
async function readInvoice({
  bytes,
  contentType,
  extract,
}: {
  bytes: Uint8Array;
  contentType: string;
  extract: SupplierInvoiceExtractor;
}): Promise<SupplierInvoiceExtraction | null> {
  try {
    return await extract({ bytes, contentType });
  } catch {
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

const PURCHASE_ORDER_DOCUMENT_FILENAME_UNIQUE_INDEX = 'documents_purchase_order_id_filename_ci_unique';

/** The order's own filename-uniqueness index, reported as the conflict it is (see the credit note). */
function mapPurchaseOrderDocumentUniqueViolation(
  error: unknown,
  input: { filename: string; purchaseOrderId: UUID },
): Error {
  const constraint = getUniqueViolationConstraint(error);
  const text = collectDocumentErrorText(error).join('\n');

  if (
    constraint?.includes(PURCHASE_ORDER_DOCUMENT_FILENAME_UNIQUE_INDEX) ||
    (text.includes('documents') && text.includes('purchase_order_id') && text.includes('lower(filename)'))
  ) {
    return new DuplicateDocumentFilenameError({
      filename: input.filename,
      ownerId: input.purchaseOrderId,
      ownerType: 'purchase_order',
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}
