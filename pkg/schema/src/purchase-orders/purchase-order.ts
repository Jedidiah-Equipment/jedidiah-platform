import { z } from 'zod';

import { DateIso, DateOnlyIso } from '../common/date.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../common/pagination.js';
import { PurchaseOrderCode } from '../common/public-code.js';
import { UUID } from '../common/uuid.js';
import { declareInventoryCostFields, InventoryCost } from '../inventory/inventory-cost.js';
import { StockMovementLengthMm } from '../inventory/stock-movement.js';
import { JobCode } from '../jobs/job.js';
import { PartStandardPurchaseLengthMm, PartUnitOfMeasure } from '../parts/part.js';

export { formatPurchaseOrderCode, PurchaseOrderCode } from '../common/public-code.js';

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;
export const PurchaseOrderStatus = z.enum(['draft', 'sent', 'cancelled']);

/** How far a sent order's receipts have got. Computed from the ledger, never stored or toggled. */
export type PurchaseOrderProgress = z.infer<typeof PurchaseOrderProgress>;
export const PurchaseOrderProgress = z.enum(['sent', 'partially-received', 'received']);

/** The stored status widened by receipts and the close-short assertion — what every reader sees. */
export type PurchaseOrderDerivedStatus = z.infer<typeof PurchaseOrderDerivedStatus>;
export const PurchaseOrderDerivedStatus = z.enum([
  'draft',
  'sent',
  'partially-received',
  'received',
  'closed-short',
  'cancelled',
]);

export type PurchaseOrderQuantity = z.infer<typeof PurchaseOrderQuantity>;
export const PurchaseOrderQuantity = z
  .number()
  .finite()
  .positive('Quantity must be greater than zero')
  .multipleOf(0.001, 'Quantity supports at most three decimal places');

export type PurchaseOrderUnitPrice = z.infer<typeof PurchaseOrderUnitPrice>;
export const PurchaseOrderUnitPrice = z
  .number()
  .finite()
  .min(0, 'Unit price must be zero or greater')
  .multipleOf(0.01, 'Unit price supports at most two decimal places');

export type PurchaseOrderLineInput = z.infer<typeof PurchaseOrderLineInput>;
export const PurchaseOrderLineInput = z
  .object({
    partId: UUID,
    quantity: PurchaseOrderQuantity,
    unitPrice: PurchaseOrderUnitPrice,
  })
  .strict();

/**
 * What one length bucket of a line has taken in and kept — received less everything returned off it,
 * every reason. This is the served fact a Return to Supplier is judged against, bucket-scoped
 * because a return names a length: judging it against another length's receipts is what let the
 * browser confirm one number while the post warned about another. Quantity-only, so a price-blind
 * reader previews the same warning as anyone else.
 */
export type PurchaseOrderReceiptBucket = z.infer<typeof PurchaseOrderReceiptBucket>;
export const PurchaseOrderReceiptBucket = z.object({
  lengthMm: StockMovementLengthMm.nullable(),
  outstandingReceivedQuantity: z.number().finite(),
});

/** A stored line always has an agreed price; only the API's cost gate can take it away (see the View). */
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLine>;
export const PurchaseOrderLine = PurchaseOrderLineInput.extend({
  partCode: z.string().trim().min(1),
  partName: z.string().trim().min(1),
  /**
   * Whether anything at all has moved against this line, receipts and returns alike. Distinct from
   * `receivedQuantity`, which is what the line has *kept*: a fully returned line is owed its stock
   * again but still carries the ledger rows a Part substitution would orphan.
   */
  hasStockMovements: z.boolean().default(false),
  /** Per length bucket, what a return can still send back. Empty where nothing has arrived. */
  receiptBuckets: z.array(PurchaseOrderReceiptBucket).default([]),
  /** What the line has received and kept — the number the derived states are read from. */
  receivedQuantity: z.number().finite(),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  supplierCode: z.string().trim().min(1).optional(),
  unitOfMeasure: PartUnitOfMeasure,
});

export type PurchaseOrderLinkedJob = z.infer<typeof PurchaseOrderLinkedJob>;
export const PurchaseOrderLinkedJob = z.object({
  code: JobCode,
  id: UUID,
});

export type PurchaseOrderSupplier = z.infer<typeof PurchaseOrderSupplier>;
export const PurchaseOrderSupplier = z.object({
  address: z.string().nullable(),
  companyName: z.string().trim().min(1),
  contactPerson: z.string().nullable(),
  email: z.email().nullable(),
  id: UUID,
  phone: z.string().nullable(),
});

/**
 * Why an action the order cannot take is refused. These are the states themselves, not messages: the
 * server maps each to the expected error it already raised, and a surface reads it to say why a
 * button is dead instead of offering one the post would refuse.
 */
export type PurchaseOrderActionBlockedReason = z.infer<typeof PurchaseOrderActionBlockedReason>;
export const PurchaseOrderActionBlockedReason = z.enum([
  'already-closed-short',
  'cancelled',
  'closed-short',
  'empty',
  'fully-received',
  'has-movements',
  'not-draft',
  'not-sent',
  'nothing-received',
]);

export type PurchaseOrderActionVerdict = z.infer<typeof PurchaseOrderActionVerdict>;
export const PurchaseOrderActionVerdict = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }),
  z.object({ allowed: z.literal(false), reason: PurchaseOrderActionBlockedReason }),
]);

/**
 * What this order may be asked to do in the state it is in — derived, never stored, and the same
 * answer the server's own write gates gate on. It judges the *order*, so a check that judges an
 * input instead (an unpriced line, a quantity below what a line has received, substituting a Part
 * that has taken delivery) stays with the write that reads that input. Permissions are a separate
 * seam: a surface renders a control when the role allows it *and* the order allows it.
 */
export type PurchaseOrderActions = z.infer<typeof PurchaseOrderActions>;
export const PurchaseOrderActions = z.object({
  amend: PurchaseOrderActionVerdict,
  cancel: PurchaseOrderActionVerdict,
  closeShort: PurchaseOrderActionVerdict,
  edit: PurchaseOrderActionVerdict,
  /** Filing the Supplier's own paperwork against the order: invoices and credit notes alike. */
  fileDocuments: PurchaseOrderActionVerdict,
  receive: PurchaseOrderActionVerdict,
  returnToSupplier: PurchaseOrderActionVerdict,
  send: PurchaseOrderActionVerdict,
});

export type PurchaseOrder = z.infer<typeof PurchaseOrder>;
export const PurchaseOrder = z.object({
  actions: PurchaseOrderActions,
  closedShortAt: DateIso.nullable(),
  code: PurchaseOrderCode,
  createdAt: DateIso,
  /** The projection every surface reads; `status` stays the narrow stored fact behind it. */
  derivedStatus: PurchaseOrderDerivedStatus,
  documentId: UUID.nullable(),
  expectedDeliveryDate: DateOnlyIso.nullable(),
  id: UUID,
  jobs: z.array(PurchaseOrderLinkedJob),
  lines: z.array(PurchaseOrderLine),
  sentAt: DateIso.nullable(),
  status: PurchaseOrderStatus,
  supplier: PurchaseOrderSupplier,
  supplierId: UUID,
  updatedAt: DateIso,
});

/**
 * What the API serves. Procurement enters the prices and can read them back; the price-blind stores
 * role reads the same order with `unitPrice` nulled by the cost gate (spec §5, §11). Only this shape
 * is nullable — the core read and the as-sent PDF always carry the real price.
 */
export type PurchaseOrderLineView = z.infer<typeof PurchaseOrderLineView>;
export const PurchaseOrderLineView = PurchaseOrderLine.extend({ unitPrice: InventoryCost });

export const PurchaseOrderLineViewCostFields = declareInventoryCostFields(PurchaseOrderLineView, 'unitPrice');

export type PurchaseOrderView = z.infer<typeof PurchaseOrderView>;
export const PurchaseOrderView = PurchaseOrder.extend({ lines: z.array(PurchaseOrderLineView) });

export type PurchaseOrderCreateInput = z.infer<typeof PurchaseOrderCreateInput>;
export const PurchaseOrderCreateInput = z
  .object({
    expectedDeliveryDate: DateOnlyIso.nullable().default(null),
    supplierId: UUID,
  })
  .strict();

function uniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export const PURCHASE_ORDER_DUPLICATE_PART_MESSAGE = 'A Part can appear only once on a Purchase Order';

/** Zero is the Draft-only sentinel for a line whose Supplier price has not been keyed yet. */
export function isPurchaseOrderLineUnpriced(line: { unitPrice: number | null }): boolean {
  return line.unitPrice === 0;
}

/** Shared with the draft form so a duplicate reads as a field error, not a rejected save. */
export function hasUniquePartIds(lines: readonly { partId: string }[]): boolean {
  return uniqueValues(lines.map((line) => line.partId));
}

/**
 * A draft is saved whole: supplier, expected date, lines, and Job links are one editable aggregate,
 * so one transaction owns the supplier/line consistency rule and one audit event records the change.
 */
export type PurchaseOrderSaveDraftInput = z.infer<typeof PurchaseOrderSaveDraftInput>;
export const PurchaseOrderSaveDraftInput = PurchaseOrderCreateInput.extend({
  id: UUID,
  jobIds: z.array(UUID),
  lines: z.array(PurchaseOrderLineInput),
})
  .strict()
  .refine((input) => hasUniquePartIds(input.lines), {
    message: PURCHASE_ORDER_DUPLICATE_PART_MESSAGE,
    path: ['lines'],
  })
  .refine((input) => uniqueValues(input.jobIds), {
    message: 'A Job can be linked only once',
    path: ['jobIds'],
  });

export type PurchaseOrderActionInput = z.infer<typeof PurchaseOrderActionInput>;
export const PurchaseOrderActionInput = z.object({ id: UUID }).strict();

export type PurchaseOrderListSortBy = z.infer<typeof PurchaseOrderListSortBy>;
export const PurchaseOrderListSortBy = z.enum(['code', 'createdAt', 'expectedDeliveryDate', 'status', 'supplier']);

export type PurchaseOrderListInput = z.infer<typeof PurchaseOrderListInput>;
export const PurchaseOrderListInput = createSearchedSortedCursorQueryInput({
  defaultSortDirection: 'desc',
  shape: {
    status: PurchaseOrderStatus.optional(),
    supplierId: UUID.optional(),
  },
  sortBy: PurchaseOrderListSortBy.default('createdAt'),
});

export type PurchaseOrderListResult = z.infer<typeof PurchaseOrderListResult>;
export const PurchaseOrderListResult = createCursorQueryResult(PurchaseOrder);

export type PurchaseOrderListViewResult = z.infer<typeof PurchaseOrderListViewResult>;
export const PurchaseOrderListViewResult = createCursorQueryResult(PurchaseOrderView);

/** The as-sent order: what was asked for, never what has since arrived against it. */
export type PurchaseOrderPdfModel = z.infer<typeof PurchaseOrderPdfModel>;
export const PurchaseOrderPdfModel = PurchaseOrder.pick({
  code: true,
  expectedDeliveryDate: true,
  supplier: true,
}).extend({
  issueDate: DateIso,
  jobCodes: z.array(JobCode),
  // What the order asked for. Neither what has arrived against it nor whether anything has moved
  // belongs on the page the Supplier is sent.
  lines: z.array(PurchaseOrderLine.omit({ hasStockMovements: true, receiptBuckets: true, receivedQuantity: true })),
  /**
   * Which rendering of the order this is. Amendments file further revisions rather than replacing
   * the original, so the printed number is how the Supplier knows the page in their hand is the
   * current one.
   */
  revision: z.int().min(1).default(1),
});

export type PurchaseOrderPdfRenderer = (input: {
  document: PurchaseOrderPdfModel;
  filename: string;
}) => Promise<Uint8Array>;
