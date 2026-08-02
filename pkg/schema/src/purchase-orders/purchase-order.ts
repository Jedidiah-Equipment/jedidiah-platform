import { z } from 'zod';

import { DateIso, DateOnlyIso } from '../common/date.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../common/pagination.js';
import { PurchaseOrderCode } from '../common/public-code.js';
import { UUID } from '../common/uuid.js';
import { InventoryCost } from '../inventory/inventory-cost.js';
import { JobCode } from '../jobs/job.js';
import { PartStandardPurchaseLengthMm, PartUnitOfMeasure } from '../parts/part.js';

export { formatPurchaseOrderCode, PurchaseOrderCode } from '../common/public-code.js';

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;
export const PurchaseOrderStatus = z.enum(['draft', 'sent', 'cancelled']);

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

export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLine>;
export const PurchaseOrderLine = PurchaseOrderLineInput.extend({
  partCode: z.string().trim().min(1),
  partName: z.string().trim().min(1),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  supplierCode: z.string().trim().min(1).optional(),
  unitOfMeasure: PartUnitOfMeasure,
  // The API cost gate projects this to null for price-blind receivers.
  unitPrice: InventoryCost,
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

export type PurchaseOrder = z.infer<typeof PurchaseOrder>;
export const PurchaseOrder = z.object({
  code: PurchaseOrderCode,
  createdAt: DateIso,
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

export type PurchaseOrderCreateInput = z.infer<typeof PurchaseOrderCreateInput>;
export const PurchaseOrderCreateInput = z
  .object({
    expectedDeliveryDate: DateOnlyIso.nullable().default(null),
    supplierId: UUID,
  })
  .strict();

export type PurchaseOrderUpdateHeaderInput = z.infer<typeof PurchaseOrderUpdateHeaderInput>;
export const PurchaseOrderUpdateHeaderInput = PurchaseOrderCreateInput.extend({ id: UUID }).strict();

function uniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export type PurchaseOrderReplaceLinesInput = z.infer<typeof PurchaseOrderReplaceLinesInput>;
export const PurchaseOrderReplaceLinesInput = z
  .object({
    id: UUID,
    lines: z.array(PurchaseOrderLineInput),
  })
  .strict()
  .refine((input) => uniqueValues(input.lines.map((line) => line.partId)), {
    message: 'A Part can appear only once on a Purchase Order',
    path: ['lines'],
  });

export type PurchaseOrderReplaceJobLinksInput = z.infer<typeof PurchaseOrderReplaceJobLinksInput>;
export const PurchaseOrderReplaceJobLinksInput = z
  .object({
    id: UUID,
    jobIds: z.array(UUID),
  })
  .strict()
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

export type PurchaseOrderPdfModel = z.infer<typeof PurchaseOrderPdfModel>;
export const PurchaseOrderPdfModel = PurchaseOrder.pick({
  code: true,
  expectedDeliveryDate: true,
  lines: true,
  supplier: true,
}).extend({
  issueDate: DateIso,
  jobCodes: z.array(JobCode),
});

export type PurchaseOrderPdfRenderer = (input: {
  document: PurchaseOrderPdfModel;
  filename: string;
}) => Promise<Uint8Array>;
