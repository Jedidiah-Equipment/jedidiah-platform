import {
  DateOnlyIso,
  DateOnlyIsoString,
  hasUniquePartIds,
  InventoryUnitCost,
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
} from '@pkg/schema';
import { z } from 'zod';

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
  newPartId: z.union([z.literal(''), UUID]),
  note: PurchaseOrderAmendmentNote,
  quantity: PurchaseOrderQuantity,
  unitPrice: PurchaseOrderUnitPrice,
});

/**
 * The one form serves all three kinds, so which fields it insists on depends on the kind: only an
 * added or substituted line names a Part, and a quantity change leaves that field unread.
 */
export function purchaseOrderAmendmentValidator(
  kind: PurchaseOrderAmendmentKind,
): z.ZodType<PurchaseOrderAmendmentFormValues, PurchaseOrderAmendmentFormValues> {
  if (kind === 'quantity-change') return PurchaseOrderAmendmentFormValues;

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
 * What a line can still send back: everything it took in, less everything already returned. Over
 * that only warns, so this is the prompt's threshold rather than a limit on the field.
 */
export function outstandingReceivedQuantity({
  line,
  returns,
}: {
  line: Pick<PurchaseOrderLineView, 'partId' | 'receivedQuantity'>;
  returns: readonly Pick<PurchaseOrderReturnRow, 'partId' | 'quantity'>[];
}): number {
  return (
    line.receivedQuantity -
    returns.reduce((total, row) => (row.partId === line.partId ? total + row.quantity : total), 0)
  );
}

/**
 * The loud confirm a warned movement earns before it posts. One helper for both directions off a
 * Purchase Order line, because a warning never blocks either of them — it only asks (spec §3).
 */
export function confirmMovementWarnings({
  action,
  confirm,
  messageFor,
  warnings,
}: {
  /** The verb the prompt ends on: "Receive it anyway?", "Post it anyway?". */
  action: string;
  confirm: (message: string) => boolean;
  messageFor: (warning: StockMovementWarningCode) => string;
  warnings: readonly StockMovementWarningCode[];
}): boolean {
  return warnings.length === 0 || confirm(`${warnings.map(messageFor).join('\n')} ${action}`);
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
