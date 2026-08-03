import {
  DateOnlyIso,
  DateOnlyIsoString,
  hasUniquePartIds,
  InventoryUnitCost,
  PostReceiptInput,
  PURCHASE_ORDER_DUPLICATE_PART_MESSAGE,
  type PurchaseOrderCreateInput,
  PurchaseOrderLineInput,
  type PurchaseOrderLineView,
  type PurchaseOrderSaveDraftInput,
  type PurchaseOrderView,
  StockMovementLengthMm,
  StockMovementQuantity,
  type StockMovementWarningCode,
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

export function confirmReceiptWarnings(
  warnings: readonly StockMovementWarningCode[],
  confirm: (message: string) => boolean,
): boolean {
  return warnings.length === 0 || confirm('This receipt exceeds the quantity ordered. Receive it anyway?');
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
