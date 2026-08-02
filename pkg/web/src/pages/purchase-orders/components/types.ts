import {
  DateOnlyIso,
  DateOnlyIsoString,
  type PurchaseOrder,
  type PurchaseOrderCreateInput,
  type PurchaseOrderUpdateHeaderInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

export type PurchaseOrderHeaderFormValues = z.infer<typeof PurchaseOrderHeaderFormValues>;
export const PurchaseOrderHeaderFormValues = z.object({
  expectedDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
  supplierId: UUID,
});

export type PurchaseOrderCreateFormValues = z.infer<typeof PurchaseOrderCreateFormValues>;
export const PurchaseOrderCreateFormValues = PurchaseOrderHeaderFormValues;

export function toPurchaseOrderCreateInput(values: PurchaseOrderCreateFormValues): PurchaseOrderCreateInput {
  return {
    expectedDeliveryDate: values.expectedDeliveryDate ? DateOnlyIso.parse(values.expectedDeliveryDate) : null,
    supplierId: values.supplierId,
  };
}

export function toPurchaseOrderHeaderFormValues(purchaseOrder: PurchaseOrder): PurchaseOrderHeaderFormValues {
  return {
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate ?? '',
    supplierId: purchaseOrder.supplierId,
  };
}

export function toPurchaseOrderHeaderInput(
  id: PurchaseOrder['id'],
  values: PurchaseOrderHeaderFormValues,
): PurchaseOrderUpdateHeaderInput {
  return {
    expectedDeliveryDate: values.expectedDeliveryDate ? DateOnlyIso.parse(values.expectedDeliveryDate) : null,
    id,
    supplierId: values.supplierId,
  };
}
