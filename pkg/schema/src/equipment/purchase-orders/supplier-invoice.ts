import { z } from 'zod';

import { DateIso, DateOnlyIso, DateOnlyIsoString } from '../../common/date.js';
import { nullableTrimmedText, requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { PurchaseOrderCode } from '../common/public-code.js';
import { declareInventoryCostFields, InventoryCost, InventoryValue } from '../inventory/inventory-cost.js';
import { SupplierCompanyName } from '../suppliers/supplier.js';

/**
 * The Supplier invoice cross-check (spec §5).
 *
 * Three shapes live here and they are deliberately separate. The **extraction** is what an AI read
 * off the PDF — persisted once per document, re-runnable, and never trusted. The **match** is
 * computed fresh on every read against the order's *current* lines, because an amendment (#1055)
 * changes those lines after the invoice was filed and a stored match would quietly go stale. The
 * **resolution** is the only human fact in the panel: which flags someone applied or dismissed.
 */

/** What the model may claim about one billed line. Every field beyond the description is optional
 *  because a real invoice PDF is allowed to be a mess — a missing number is not a failed read. */
export type SupplierInvoiceExtractionLine = z.infer<typeof SupplierInvoiceExtractionLine>;
export const SupplierInvoiceExtractionLine = z.object({
  description: z.string().trim().default(''),
  jobCodes: z.array(z.string().trim().min(1)).default([]),
  lineTotal: z.number().finite().nullable().default(null),
  /** A Part code or the Supplier's own code, whichever the invoice prints; matching tries both. */
  partCode: nullableTrimmedText().default(null),
  quantity: z.number().finite().nullable().default(null),
  unitPrice: z.number().finite().nullable().default(null),
});

/**
 * One AI read of one invoice PDF. Job codes surface at both levels because Suppliers echo them
 * inconsistently — in a header block on some invoices, against individual lines on others — and
 * they are matching hints either way (spec §4).
 */
export type SupplierInvoiceExtraction = z.infer<typeof SupplierInvoiceExtraction>;
export const SupplierInvoiceExtraction = z.object({
  // The plain string rule rather than the branded scalar: this schema is handed to the model as
  // JSON Schema, and a Date-coercing union cannot be expressed as one.
  invoiceDate: DateOnlyIsoString.nullable().default(null),
  invoiceNumber: nullableTrimmedText().default(null),
  jobCodes: z.array(z.string().trim().min(1)).default([]),
  lines: z.array(SupplierInvoiceExtractionLine).default([]),
});

export type InvoiceMatchFlagKind = z.infer<typeof InvoiceMatchFlagKind>;
export const InvoiceMatchFlagKind = z.enum([
  'price-mismatch',
  'quantity-mismatch',
  'unmatched-invoice-line',
  'unmatched-po-line',
]);

export const INVOICE_MATCH_FLAG_LABELS: Record<InvoiceMatchFlagKind, string> = {
  'price-mismatch': 'Price differs',
  'quantity-mismatch': 'Quantity differs',
  'unmatched-invoice-line': 'Not on this order',
  'unmatched-po-line': 'Not on this invoice',
};

/** How an invoice line was tied to an order line, or that nothing tied it. */
export type InvoiceMatchMethod = z.infer<typeof InvoiceMatchMethod>;
export const InvoiceMatchMethod = z.enum(['part-code', 'supplier-code', 'description', 'none']);

/**
 * A flag's stable identity across visits, so a dismissal survives a re-read of the same invoice.
 *
 * Keyed on the order line's Part where there is one and on the invoice line's position where there
 * is not — the two namespaces are disjoint by construction, and neither moves when the *other* side
 * of the panel changes.
 */
export type InvoiceFlagKey = z.infer<typeof InvoiceFlagKey>;
export const InvoiceFlagKey = requiredTrimmedText('Flag key is required');

export function invoiceFlagKey(kind: InvoiceMatchFlagKind, subject: string): InvoiceFlagKey {
  return `${kind}:${subject}`;
}

export type InvoiceFlagResolutionKind = z.infer<typeof InvoiceFlagResolutionKind>;
export const InvoiceFlagResolutionKind = z.enum(['applied', 'dismissed']);

export type InvoiceFlagResolution = z.infer<typeof InvoiceFlagResolution>;
export const InvoiceFlagResolution = z.object({
  actorName: z.string().trim().min(1).nullable(),
  createdAt: DateIso,
  kind: InvoiceFlagResolutionKind,
  /** The revaluation an apply posted; a dismissal writes nothing to the ledger. */
  stockMovementId: UUID.nullable(),
});

export type InvoiceMatchFlag = z.infer<typeof InvoiceMatchFlag>;
export const InvoiceMatchFlag = z.object({
  key: InvoiceFlagKey,
  kind: InvoiceMatchFlagKind,
});

/** What a price correction would do to the Part's moving average, computed for one flagged row. */
export type InvoicePriceCorrection = z.infer<typeof InvoicePriceCorrection>;
export const InvoicePriceCorrection = z.object({
  /** The average before the correction; null when the Part has no costed row to correct. */
  averageUnitCost: InventoryCost,
  /**
   * False when stock on hand is zero or negative, or the Part carries no average yet: the
   * correction has nothing left on the shelf to attach to, so the panel says so instead of
   * offering a button that would post a meaningless revaluation (spec §5).
   */
  canApply: z.boolean(),
  newAverageUnitCost: InventoryCost,
  /** What the receipts on this line were stamped at, quantity-weighted. */
  receiptedUnitCost: InventoryCost,
  receivedQuantity: z.number().finite(),
  /**
   * Stock on hand in the unit the average is expressed per — millimetres for linear stock, pieces
   * for everything else, which is what makes the correction's arithmetic dimensionally honest.
   */
  stockOnHandBasis: z.number().finite(),
});

export const InvoicePriceCorrectionCostFields = declareInventoryCostFields(
  InvoicePriceCorrection,
  'averageUnitCost',
  'newAverageUnitCost',
  'receiptedUnitCost',
);

/**
 * One row of the panel: an order line, the invoice line matched to it, or neither side matched.
 *
 * Prices are cost leaves even though the whole panel is gated on `equipment_inventory_cost:read` — the gate
 * on the procedure is what actually hides them, and declaring them keeps this contract honest if
 * the row ever reaches a surface with a wider gate.
 */
export type SupplierInvoiceMatchRow = z.infer<typeof SupplierInvoiceMatchRow>;
export const SupplierInvoiceMatchRow = z.object({
  /** Present only on a priced disagreement, which is the only flag one click can heal. */
  correction: InvoicePriceCorrection.nullable(),
  description: z.string(),
  flags: z.array(InvoiceMatchFlag),
  /** Absent on an order line nothing on the invoice matched. */
  invoiceQuantity: z.number().finite().nullable(),
  invoiceUnitPrice: InventoryCost,
  matchMethod: InvoiceMatchMethod,
  /** Absent on an invoice line nothing on the order matched. */
  orderedQuantity: z.number().finite().nullable(),
  partCode: z.string().nullable(),
  partId: UUID.nullable(),
  partName: z.string().nullable(),
  unitPrice: InventoryCost,
});

export const SupplierInvoiceMatchRowCostFields = declareInventoryCostFields(
  SupplierInvoiceMatchRow,
  'invoiceUnitPrice',
  'unitPrice',
);

/**
 * The panel for one filed invoice.
 *
 * `readable` false is the explicit failure contract (spec §5): the extraction threw or came back
 * unusable, so there are no rows and no flags, the upload is still filed, and nothing is blocked.
 */
export type SupplierInvoiceReview = z.infer<typeof SupplierInvoiceReview>;
export const SupplierInvoiceReview = z.object({
  documentId: UUID,
  extractedAt: DateIso,
  filename: z.string(),
  invoiceDate: DateOnlyIso.nullable(),
  invoiceNumber: z.string().nullable(),
  jobCodes: z.array(z.string()),
  readable: z.boolean(),
  resolutions: z.record(InvoiceFlagKey, InvoiceFlagResolution),
  rows: z.array(SupplierInvoiceMatchRow),
  uploaderName: z.string().trim().min(1).nullable(),
});

export type SupplierInvoiceReviewResult = z.infer<typeof SupplierInvoiceReviewResult>;
export const SupplierInvoiceReviewResult = z.object({ items: z.array(SupplierInvoiceReview) });

export type SupplierInvoiceCorrectionInput = z.infer<typeof SupplierInvoiceCorrectionInput>;
export const SupplierInvoiceCorrectionInput = z
  .object({
    documentId: UUID,
    partId: UUID,
    purchaseOrderId: UUID,
  })
  .strict();

export type SupplierInvoiceDismissFlagInput = z.infer<typeof SupplierInvoiceDismissFlagInput>;
export const SupplierInvoiceDismissFlagInput = z
  .object({
    documentId: UUID,
    flagKey: InvoiceFlagKey,
    purchaseOrderId: UUID,
  })
  .strict();

/**
 * One line where what the Supplier billed disagrees with what the order agreed (spec §12).
 *
 * Plant-wide and cost-gated, read the same way the panel is: over persisted extractions, matched
 * fresh against current lines, so an amended price stops showing as a variance without anything
 * having to be rewritten.
 */
export type InvoicePriceVarianceRow = z.infer<typeof InvoicePriceVarianceRow>;
export const InvoicePriceVarianceRow = z.object({
  documentId: UUID,
  filename: z.string(),
  invoiceNumber: z.string().nullable(),
  invoiceUnitPrice: InventoryCost,
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  purchaseOrderCode: PurchaseOrderCode,
  purchaseOrderId: UUID,
  /** What the invoice printed, or null when it printed a price against no quantity at all. */
  quantity: z.number().finite().nullable(),
  resolution: InvoiceFlagResolutionKind.nullable(),
  supplierName: SupplierCompanyName,
  unitPrice: InventoryCost,
  /** Signed: positive means the Supplier billed above the agreed price. Null with the quantity. */
  varianceValue: InventoryValue,
});

export const InvoicePriceVarianceRowCostFields = declareInventoryCostFields(
  InvoicePriceVarianceRow,
  'invoiceUnitPrice',
  'unitPrice',
  'varianceValue',
);

export type InvoicePriceVarianceResult = z.infer<typeof InvoicePriceVarianceResult>;
export const InvoicePriceVarianceResult = z.object({ items: z.array(InvoicePriceVarianceRow) });
