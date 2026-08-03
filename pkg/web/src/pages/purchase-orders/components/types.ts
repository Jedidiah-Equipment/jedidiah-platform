import {
  DateOnlyIso,
  DateOnlyIsoString,
  type PurchaseOrderCreateInput,
  PurchaseOrderLineInput,
  type PurchaseOrderSaveDraftInput,
  type PurchaseOrderView,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

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
