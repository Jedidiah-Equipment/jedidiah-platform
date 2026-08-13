import {
  DateOnlyIso,
  DateOnlyIsoString,
  hasUniquePartIds,
  InventoryUnitCost,
  type Part,
  PostReceiptInput,
  PostReturnToSupplierInput,
  PURCHASE_ORDER_DUPLICATE_PART_MESSAGE,
  type PurchaseOrderAmendmentKind,
  PurchaseOrderAmendmentNote,
  type PurchaseOrderCreateInput,
  PurchaseOrderLineInput,
  type PurchaseOrderLineView,
  PurchaseOrderQuantity,
  type PurchaseOrderReturnRow,
  type PurchaseOrderSaveDraftInput,
  PurchaseOrderUnitPrice,
  type PurchaseOrderView,
  StockMovementLengthMm,
  StockMovementQuantity,
  type StockMovementWarningCode,
  StockReturnToSupplierReason,
  UUID,
  unitClassFor,
} from '@pkg/schema';
import { z } from 'zod';

import { roundNumberFieldValue } from '@/components/form/fields/NumberField.js';
import { optionalNumber } from '@/components/form/utils/form-schema.js';

export type PurchaseOrderCreateFormValues = z.infer<typeof PurchaseOrderCreateFormValues>;
export const PurchaseOrderCreateFormValues = z.object({
  expectedDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
  supplierId: UUID,
});

/** The whole editable draft: header, lines, and Job links move together through one save. */
export type PurchaseOrderDraftFormValues = z.infer<typeof PurchaseOrderDraftFormValues>;
export const PurchaseOrderDraftFormValues = PurchaseOrderCreateFormValues.extend({
  jobIds: z.array(UUID),
  lines: z.array(PurchaseOrderLineInput),
  // Mirrors PurchaseOrderSaveDraftInput so a duplicate Part fails validation here rather than
  // autosaving into a server rejection the reader cannot trace back to a row.
}).refine((values) => hasUniquePartIds(values.lines), {
  message: PURCHASE_ORDER_DUPLICATE_PART_MESSAGE,
  path: ['lines'],
});

/**
 * The decimals a draft line's quantity is keyed and kept in: three where `PurchaseOrderQuantity`
 * allows them, none where the server counts whole units — the same `unitClassFor` verdict it raises
 * `PurchaseOrderInvalidQuantityError` on. A Part that has not resolved yet declares no precision at
 * all; the Parts query is still in flight, and rounding on that guess would round a measured
 * quantity away.
 */
export function quantityDecimals(part: Pick<Part, 'unitOfMeasure'> | undefined): number | undefined {
  if (!part) return undefined;

  return unitClassFor(part.unitOfMeasure) === 'measured' ? 3 : 0;
}

/**
 * What a line's quantity becomes when its Part changes: 7.5 kg swapped for a Part counted in pieces
 * is 8 of them. The picker settles this itself because the autosave flush is one microtask behind it,
 * and the field's own rounding is a render pass behind that — long enough to post the old number
 * against the new Part and earn a refusal the row does not look like it deserves.
 */
export function quantityForPart(quantity: number, part: Pick<Part, 'unitOfMeasure'> | undefined): number {
  return roundNumberFieldValue(quantity, quantityDecimals(part));
}

export function toPurchaseOrderCreateInput(values: PurchaseOrderCreateFormValues): PurchaseOrderCreateInput {
  return {
    expectedDeliveryDate: toExpectedDeliveryDate(values.expectedDeliveryDate),
    supplierId: values.supplierId,
  };
}

export function toPurchaseOrderDraftFormValues(purchaseOrder: PurchaseOrderView): PurchaseOrderDraftFormValues {
  return {
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate ?? '',
    jobIds: purchaseOrder.jobs.map((job) => job.id),
    // A price-blind reader never reaches the editable form, so a stored line always has its price.
    lines: purchaseOrder.lines.map((line) => ({
      partId: line.partId,
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? 0,
    })),
    supplierId: purchaseOrder.supplierId,
  };
}

export function toPurchaseOrderDraftInput(
  id: PurchaseOrderView['id'],
  values: PurchaseOrderDraftFormValues,
): PurchaseOrderSaveDraftInput {
  return {
    expectedDeliveryDate: toExpectedDeliveryDate(values.expectedDeliveryDate),
    id,
    jobIds: values.jobIds,
    lines: values.lines,
    supplierId: values.supplierId,
  };
}

function toExpectedDeliveryDate(value: string) {
  return value ? DateOnlyIso.parse(value) : null;
}

/** What the dock keys in. Every rule beyond the length being optional stays owned by `@pkg/schema`. */
export type PurchaseOrderReceiveFormValues = z.infer<typeof PurchaseOrderReceiveFormValues>;
export const PurchaseOrderReceiveFormValues = z.object({
  lengthMm: optionalNumber(StockMovementLengthMm),
  quantity: StockMovementQuantity,
  unitCost: optionalNumber(InventoryUnitCost),
});

/** The outstanding quantity a line is still waiting on, floored at zero once it is over-delivered. */
export function outstandingQuantity(line: Pick<PurchaseOrderLineView, 'quantity' | 'receivedQuantity'>): number {
  return Math.max(0, line.quantity - line.receivedQuantity);
}

export function isLinearLine(line: Pick<PurchaseOrderLineView, 'unitOfMeasure'>): boolean {
  return line.unitOfMeasure === 'mm';
}

/**
 * What the buyer keys when the phone call ends. The note is mandatory on every kind, so the form
 * carries the schema's own rule rather than a second one — the call *is* the record (spec §4).
 */
export type PurchaseOrderAmendmentFormValues = z.infer<typeof PurchaseOrderAmendmentFormValues>;
export const PurchaseOrderAmendmentFormValues = z.object({
  expectedDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
  newPartId: z.union([z.literal(''), UUID]),
  note: PurchaseOrderAmendmentNote,
  quantity: PurchaseOrderQuantity,
  unitPrice: PurchaseOrderUnitPrice,
});

/**
 * The one form serves all four kinds, so each amendment only insists on the field it changes.
 */
export function purchaseOrderAmendmentValidator(
  kind: PurchaseOrderAmendmentKind,
): z.ZodType<PurchaseOrderAmendmentFormValues, PurchaseOrderAmendmentFormValues> {
  if (kind === 'quantity-change') return PurchaseOrderAmendmentFormValues;

  if (kind === 'expected-date-change') {
    return PurchaseOrderAmendmentFormValues.refine((values) => values.expectedDeliveryDate !== '', {
      message: 'Choose an expected delivery date',
      path: ['expectedDeliveryDate'],
    });
  }

  return PurchaseOrderAmendmentFormValues.refine((values) => values.newPartId !== '', {
    message: 'Choose a Part',
    path: ['newPartId'],
  });
}

/** What goes back to the Supplier. The value is never keyed — the ledger takes it off the receipts. */
export type PurchaseOrderReturnFormValues = z.infer<typeof PurchaseOrderReturnFormValues>;
export const PurchaseOrderReturnFormValues = z.object({
  lengthMm: optionalNumber(StockMovementLengthMm),
  note: z.string(),
  quantity: StockMovementQuantity,
  reason: StockReturnToSupplierReason,
});

export function toReturnToSupplierInput({
  line,
  purchaseOrderId,
  values,
}: {
  line: Pick<PurchaseOrderLineView, 'partId' | 'unitOfMeasure'>;
  purchaseOrderId: PurchaseOrderView['id'];
  values: PurchaseOrderReturnFormValues;
}) {
  return PostReturnToSupplierInput.parse({
    lengthMm: isLinearLine(line) && !Number.isNaN(values.lengthMm) ? values.lengthMm : null,
    note: values.note,
    partId: line.partId,
    purchaseOrderId,
    quantity: values.quantity,
    reason: values.reason,
  });
}

/**
 * What this line can still send back in the bucket a return of this length would post against. The
 * figure is served by `purchaseOrders.get`, computed by the same pool the post sums under its lock —
 * read rather than re-derived, because a threshold computed here from netted totals is what let the
 * dialog confirm one number while the post warned about another.
 */
export function outstandingReceivedForLength({
  lengthMm,
  line,
}: {
  lengthMm: number | null;
  line: Pick<PurchaseOrderLineView, 'receiptBuckets' | 'standardPurchaseLengthMm' | 'unitOfMeasure'>;
}): number {
  // A return keys nothing for a Part bought in one standard length; a short piece keys its own.
  const bucketLength = line.unitOfMeasure === 'mm' ? (lengthMm ?? line.standardPurchaseLengthMm) : null;

  return line.receiptBuckets.find((bucket) => bucket.lengthMm === bucketLength)?.outstandingReceivedQuantity ?? 0;
}

/**
 * A blank length on a linear line means "the length we buy it in", which the ledger fills from the
 * Part's standard purchase length — so the dock only keys one when the delivery is not that.
 */
export function toReceiptInput({
  canReadCosts,
  line,
  purchaseOrderId,
  values,
}: {
  canReadCosts: boolean;
  line: Pick<PurchaseOrderLineView, 'partId' | 'unitOfMeasure'>;
  purchaseOrderId: PurchaseOrderView['id'];
  values: PurchaseOrderReceiveFormValues;
}) {
  return PostReceiptInput.parse({
    lengthMm: isLinearLine(line) && !Number.isNaN(values.lengthMm) ? values.lengthMm : null,
    partId: line.partId,
    purchaseOrderId,
    quantity: values.quantity,
    unitCost: canReadCosts && !Number.isNaN(values.unitCost) ? values.unitCost : null,
  });
}
