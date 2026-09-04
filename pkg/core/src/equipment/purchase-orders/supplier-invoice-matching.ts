import { user } from '@pkg/db';
import {
  documents,
  invoiceExtractions,
  invoiceFlagResolutions,
  parts,
  purchaseOrderLines,
  purchaseOrders,
  supplier,
} from '@pkg/db/equipment';
import { matchInvoiceLines } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { InvoiceFlagResolution, SupplierInvoiceExtraction } from '@pkg/schema/equipment';
import { SupplierInvoiceExtraction as SupplierInvoiceExtractionSchema } from '@pkg/schema/equipment';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { newestPurchaseOrderDocumentFirst, type PurchaseOrderDb } from './purchase-order-service.js';

/**
 * The reading half of the Supplier invoice cross-check: what was filed, what an AI made of it, how
 * that lines up against the order today, and which disagreements someone has already answered.
 *
 * The order's own panel and the plant-wide variance list are both built out of exactly this, which
 * is what stops the two from disagreeing about whether a line is in dispute.
 */

/**
 * One invoice matched against the order as it stands now, each row carrying the price flag it
 * raised and whatever answer someone has already given that flag.
 *
 * The order's own panel and the plant-wide variance list both start here. They build different
 * things out of it — one offers a correction, the other totals the exposure — but the question
 * "is this line flagged, and has anyone dealt with it" is answered once, so the two can never
 * disagree about which lines are in dispute.
 */
export function matchInvoiceRows({
  extraction,
  orderLines,
  resolutions,
}: {
  extraction: SupplierInvoiceExtraction;
  orderLines: readonly MatchOrderLine[];
  resolutions: Map<string, InvoiceFlagResolution> | undefined;
}) {
  return matchInvoiceLines({ invoiceLines: extraction.lines, orderLines }).map((row) => {
    const priceFlag = row.flags.find((flag) => flag.kind === 'price-mismatch');

    return { answer: priceFlag ? resolutions?.get(priceFlag.key) : undefined, priceFlag, row };
  });
}

export type InvoiceDocumentRow = {
  createdAt: Date;
  documentId: UUID;
  extractedAt: Date | null;
  extraction: SupplierInvoiceExtraction | null;
  filename: string;
  purchaseOrderId: UUID;
  uploaderName: string | null;
};

/**
 * The Supplier invoices on one order, or on every order when no order is named — and narrowed to a
 * single document when one is, which is how a mutation answers for one flag without assembling
 * every invoice the order carries.
 */
export async function loadInvoiceDocuments(
  db: PurchaseOrderDb,
  scope: { documentId?: UUID; purchaseOrderId?: UUID } = {},
): Promise<InvoiceDocumentRow[]> {
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
      and(
        scope.purchaseOrderId
          ? eq(documents.purchaseOrderId, scope.purchaseOrderId)
          : eq(documents.ownerType, 'purchase_order'),
        ...(scope.documentId ? [eq(documents.id, scope.documentId)] : []),
        isSupplierInvoice,
      ),
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

export type MatchOrderLine = {
  orderedQuantity: number;
  partCode: string;
  partId: string;
  partName: string;
  supplierCode: string | null;
  unitPrice: number | null;
};

export async function loadOrderLinesByOrder(
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

export async function loadOrderHeaders(db: PurchaseOrderDb, purchaseOrderIds: readonly UUID[]) {
  const rows = await db
    .select({ code: purchaseOrders.code, id: purchaseOrders.id, supplierName: supplier.companyName })
    .from(purchaseOrders)
    .innerJoin(supplier, eq(supplier.id, purchaseOrders.supplierId))
    .where(inArray(purchaseOrders.id, [...purchaseOrderIds]));

  return new Map(rows.map((row) => [row.id, row]));
}

export async function loadResolutions(
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
