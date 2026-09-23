import { z } from 'zod';

import { DateIso, DateOnlyIso } from '../../common/date.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../../common/pagination.js';
import { requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { PurchaseOrderCode } from '../common/public-code.js';
import { declareInventoryCostFields, InventoryCost } from '../inventory/inventory-cost.js';
import { StockMovementLengthMm } from '../inventory/stock-movement.js';
import { JobCode } from '../jobs/job.js';
import { PartStandardPurchaseLengthMm, PartUnitOfMeasure } from '../parts/part.js';

export { formatPurchaseOrderCode, PurchaseOrderCode } from '../common/public-code.js';

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;
export const PurchaseOrderStatus = z.enum(['draft', 'approved', 'sent', 'cancelled']);

/** How far a sent order's Receipts and Arrivals have got. Computed, never stored or toggled. */
export type PurchaseOrderProgress = z.infer<typeof PurchaseOrderProgress>;
export const PurchaseOrderProgress = z.enum(['sent', 'partially-received', 'received']);

/**
 * The stored status widened by receipts and the close-short assertion — what every reader sees.
 * `sent` is deliberately absent: a sent order with nothing received yet wears the `approved` badge
 * and the list's own Sent tick carries whether it has gone out.
 */
export type PurchaseOrderDerivedStatus = z.infer<typeof PurchaseOrderDerivedStatus>;
export const PurchaseOrderDerivedStatus = z.enum([
  'draft',
  'approved',
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

export type PurchaseOrderLineKind = z.infer<typeof PurchaseOrderLineKind>;
export const PurchaseOrderLineKind = z.enum(['part', 'custom']);

export const PurchaseOrderCustomLineDescription = requiredTrimmedText('Describe what is being ordered').max(500);
export const PurchaseOrderCustomLineUnit = requiredTrimmedText('Enter a unit, such as each or box').max(30);
export const PurchaseOrderCustomLineSupplierCode = z.string().trim().min(1).max(100);

export const PurchaseOrderPartLineInput = z
  .object({
    kind: z.literal('part'),
    partId: UUID,
    quantity: PurchaseOrderQuantity,
    unitPrice: PurchaseOrderUnitPrice,
  })
  .strict();

export const PurchaseOrderCustomLineInput = z
  .object({
    description: PurchaseOrderCustomLineDescription,
    id: UUID,
    kind: z.literal('custom'),
    quantity: PurchaseOrderQuantity,
    supplierCode: PurchaseOrderCustomLineSupplierCode.nullable().default(null),
    unit: PurchaseOrderCustomLineUnit,
    unitPrice: PurchaseOrderUnitPrice,
  })
  .strict();

export type PurchaseOrderLineInput = z.infer<typeof PurchaseOrderLineInput>;
export const PurchaseOrderLineInput = z.discriminatedUnion('kind', [
  PurchaseOrderPartLineInput,
  PurchaseOrderCustomLineInput,
]);

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

const PurchaseOrderLineBase = z.object({
  /** The Part's name or the Custom Line's own text — what a kind-blind surface calls the line. */
  description: z.string().trim().min(1),
  /**
   * Whether a Part Line has ledger rows or a Custom Line has Arrivals. Distinct from
   * `receivedQuantity`, which is what the line has kept: a fully reversed line is owed again
   * but its history still prevents the line from being removed.
   */
  hasStockMovements: z.boolean().default(false),
  /** The line's own identity. Ledger rows still reach a Part Line by `(purchaseOrderId, partId)`. */
  id: UUID,
  quantity: PurchaseOrderQuantity,
  /** What the line has received and kept — the number the derived states are read from. */
  receivedQuantity: z.number().finite(),
  supplierCode: z.string().trim().min(1).nullable(),
  unitPrice: PurchaseOrderUnitPrice,
});

export type PurchaseOrderPartLine = z.infer<typeof PurchaseOrderPartLine>;
export const PurchaseOrderPartLine = PurchaseOrderLineBase.extend({
  kind: z.literal('part'),
  partCode: z.string().trim().min(1),
  partId: UUID,
  /** Per length bucket, what a return can still send back. Empty where nothing has arrived. */
  receiptBuckets: z.array(PurchaseOrderReceiptBucket).default([]),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  unitOfMeasure: PartUnitOfMeasure,
});

export type PurchaseOrderCustomLine = z.infer<typeof PurchaseOrderCustomLine>;
export const PurchaseOrderCustomLine = PurchaseOrderLineBase.extend({
  kind: z.literal('custom'),
  unit: PurchaseOrderCustomLineUnit,
});

/** A stored line always has an agreed price; only the API's cost gate can take it away (see the View). */
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLine>;
export const PurchaseOrderLine = z.discriminatedUnion('kind', [PurchaseOrderPartLine, PurchaseOrderCustomLine]);

/** A Part appears once per order, so its Part is enough to find a Part Line. Served and stored alike. */
export function findPurchaseOrderPartLine<TLine extends { kind: 'custom' } | { kind: 'part'; partId: string }>(
  lines: readonly TLine[],
  partId: string,
): Extract<TLine, { kind: 'part' }> | undefined {
  return lines.find((line): line is Extract<TLine, { kind: 'part' }> => line.kind === 'part' && line.partId === partId);
}

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
  'not-approved',
  'not-draft',
  'not-sent',
  'nothing-received',
  'sent',
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
  approve: PurchaseOrderActionVerdict,
  cancel: PurchaseOrderActionVerdict,
  closeShort: PurchaseOrderActionVerdict,
  edit: PurchaseOrderActionVerdict,
  /** Filing the Supplier's own paperwork against the order: invoices and credit notes alike. */
  fileDocuments: PurchaseOrderActionVerdict,
  /** The generated Supplier copy, offered until sending saves the as-sent PDF in its place. */
  preview: PurchaseOrderActionVerdict,
  receive: PurchaseOrderActionVerdict,
  returnToSupplier: PurchaseOrderActionVerdict,
  /** The audited un-approve: approval locks the order, and this is the one way back to editing. */
  revertToDraft: PurchaseOrderActionVerdict,
  send: PurchaseOrderActionVerdict,
});

/** One Purchase Order Action by name, as a gate asks for it. */
export type PurchaseOrderActionName = keyof PurchaseOrderActions;

export type PurchaseOrder = z.infer<typeof PurchaseOrder>;
export const PurchaseOrder = z.object({
  actions: PurchaseOrderActions,
  approvedAt: DateIso.nullable(),
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
export type PurchaseOrderPartLineView = z.infer<typeof PurchaseOrderPartLineView>;
export const PurchaseOrderPartLineView = PurchaseOrderPartLine.extend({ unitPrice: InventoryCost });

export type PurchaseOrderCustomLineView = z.infer<typeof PurchaseOrderCustomLineView>;
export const PurchaseOrderCustomLineView = PurchaseOrderCustomLine.extend({ unitPrice: InventoryCost });

export type PurchaseOrderLineView = z.infer<typeof PurchaseOrderLineView>;
export const PurchaseOrderLineView = z.discriminatedUnion('kind', [
  PurchaseOrderPartLineView,
  PurchaseOrderCustomLineView,
]);

// Both kinds gate the same field, so the API projects a line without asking which it is.
export const PurchaseOrderLineViewCostFields = declareInventoryCostFields(PurchaseOrderPartLineView, 'unitPrice');
declareInventoryCostFields(PurchaseOrderCustomLineView, 'unitPrice');

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

/**
 * Zero is the sentinel for a line whose Supplier price has not been keyed yet. It survives approval
 * — approving judges the order, and it is sending that asserts every line carries an agreed price —
 * so it can still be sitting on an approved order.
 */
export function isPurchaseOrderLineUnpriced(line: { unitPrice: number | null }): boolean {
  return line.unitPrice === 0;
}

/**
 * Whether a money total for this order would be a lie. True only while a line can still be unpriced:
 * once the order is sent, `assertLinesArePriced` has guaranteed every line has a price, so any zero
 * on it is a real agreed zero rather than a blank.
 */
export function purchaseOrderHasUnpricedLines(purchaseOrder: {
  lines: readonly { unitPrice: number | null }[];
  status: PurchaseOrderStatus;
}): boolean {
  const isPendingSend = purchaseOrder.status === 'draft' || purchaseOrder.status === 'approved';

  return isPendingSend && purchaseOrder.lines.some(isPurchaseOrderLineUnpriced);
}

/** Shared with the draft form so a duplicate reads as a field error, not a rejected save. */
export function hasUniquePartIds(lines: readonly { kind: PurchaseOrderLineKind; partId?: string }[]): boolean {
  return uniqueValues(lines.flatMap((line) => (line.kind === 'part' && line.partId ? [line.partId] : [])));
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
  .refine((input) => uniqueValues(input.lines.flatMap((line) => (line.kind === 'custom' ? [line.id] : []))), {
    message: 'A Custom Line id can appear only once on a Purchase Order',
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
  lastModified: z.object({
    actorName: z.string().nullable(),
    occurredAt: DateIso,
  }),
  // What the order asked for. Neither what has arrived against it nor whether anything has moved
  // belongs on the page the Supplier is sent.
  lines: z.array(
    z.discriminatedUnion('kind', [
      PurchaseOrderPartLine.omit({ hasStockMovements: true, receiptBuckets: true, receivedQuantity: true }),
      PurchaseOrderCustomLine.omit({ hasStockMovements: true, receivedQuantity: true }),
    ]),
  ),
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
