import { FeedbackPurchaseOrder } from '@pkg/schema/equipment';

/** Loads a Feedback row's Purchase Order as a Job reader may see it: its code and Supplier, never its prices. */
export const feedbackPurchaseOrderRelation = {
  columns: { id: true, code: true },
  with: { supplier: { columns: { companyName: true } } },
} as const;

export const toFeedbackPurchaseOrder = (
  order: { id: string; code: number; supplier: { companyName: string } } | null,
): FeedbackPurchaseOrder | null =>
  order && FeedbackPurchaseOrder.parse({ id: order.id, code: order.code, supplierName: order.supplier.companyName });
