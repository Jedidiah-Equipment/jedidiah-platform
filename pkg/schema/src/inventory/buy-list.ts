import { z } from 'zod';

import { DateOnlyIso } from '../common/date.js';
import { JobCode, PurchaseOrderCode } from '../common/public-code.js';
import { UUID } from '../common/uuid.js';
import { PartMinimumStock, PartStandardPurchaseLengthMm, PartUnitOfMeasure } from '../parts/part.js';
import { SupplierCompanyName } from '../suppliers/supplier.js';

/**
 * Why a Part is on the buy list. One list carries all three rather than three screens (spec §12):
 * they are read by the same person on the same morning, and a Part is routinely more than one of
 * them at once.
 */
export type BuyListReason = z.infer<typeof BuyListReason>;
export const BuyListReason = z.enum(['out-of-stock', 'negative-free', 'below-minimum']);

export const BUY_LIST_REASON_LABELS = {
  'below-minimum': 'Below minimum',
  'negative-free': 'Short for Jobs',
  'out-of-stock': 'Out of stock',
} as const satisfies Record<BuyListReason, string>;

/** The calming reference beside a shortfall: what is already coming, and when it was promised. */
export type BuyListCoveringOrder = z.infer<typeof BuyListCoveringOrder>;
export const BuyListCoveringOrder = z.object({
  code: PurchaseOrderCode,
  expectedDeliveryDate: DateOnlyIso.nullable(),
  id: UUID,
  outstandingQuantity: z.number().finite(),
});

/** A Job whose open commitment drives this Part's shortfall, with the Slot date that ranks it. */
export type BuyListDrivingJob = z.infer<typeof BuyListDrivingJob>;
export const BuyListDrivingJob = z.object({
  code: JobCode,
  committedQuantity: z.number().finite(),
  displayName: z.string(),
  /** Earliest unfinished Work Slot; null when the Job holds no scheduled Slot at all. */
  earliestSlotDate: DateOnlyIso.nullable(),
  id: UUID,
});

export type BuyListRow = z.infer<typeof BuyListRow>;
export const BuyListRow = z.object({
  committed: z.number().finite(),
  coveringOrders: z.array(BuyListCoveringOrder),
  drivingJobs: z.array(BuyListDrivingJob),
  /** The minimum of the driving Jobs' earliest Slot dates; null ranks the row last. */
  earliestDemandDate: DateOnlyIso.nullable(),
  free: z.number().finite(),
  /** A Built Part is made, never bought, so it can carry a shortfall but never a PO line. */
  isInternallyFabricated: z.boolean(),
  minimumStock: PartMinimumStock.nullable(),
  onOrder: z.number().finite(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  quantity: z.number().finite(),
  reasons: z.array(BuyListReason).min(1),
  /** What it would take to clear every reason, before netting what is already on order. */
  shortfall: z.number().finite(),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  suggestedQuantity: z.number().finite(),
  supplierId: UUID.nullable(),
  supplierName: SupplierCompanyName.nullable(),
  unitOfMeasure: PartUnitOfMeasure,
});

export type BuyListResult = z.infer<typeof BuyListResult>;
export const BuyListResult = z.object({ items: z.array(BuyListRow) });

/** A sent order past the date it was promised for, with a remainder nobody has released. */
export type LatePurchaseOrderRow = z.infer<typeof LatePurchaseOrderRow>;
export const LatePurchaseOrderRow = z.object({
  code: PurchaseOrderCode,
  daysLate: z.int().positive(),
  expectedDeliveryDate: DateOnlyIso,
  id: UUID,
  openLineCount: z.int().positive(),
  supplierName: SupplierCompanyName,
});

export type LatePurchaseOrderResult = z.infer<typeof LatePurchaseOrderResult>;
export const LatePurchaseOrderResult = z.object({ items: z.array(LatePurchaseOrderRow) });

export type PurchaseOrderSeedLine = z.infer<typeof PurchaseOrderSeedLine>;
export const PurchaseOrderSeedLine = z
  .object({
    partId: UUID,
    quantity: z.number().finite().positive('Quantity must be greater than zero'),
  })
  .strict();

/**
 * A ticked selection on its way to becoming drafts. The selection is deliberately supplier-blind —
 * the split into one draft per Supplier is the service's job, not the caller's (spec §4).
 */
export type PurchaseOrderSeedInput = z.infer<typeof PurchaseOrderSeedInput>;
export const PurchaseOrderSeedInput = z
  .object({
    /** Seeded from a Job: every draft links back to it. Null when seeded from the buy list. */
    jobId: UUID.nullable().default(null),
    lines: z.array(PurchaseOrderSeedLine).min(1, 'Select at least one Part'),
  })
  .strict()
  .refine((input) => new Set(input.lines.map((line) => line.partId)).size === input.lines.length, {
    message: 'A Part can appear only once in a selection',
    path: ['lines'],
  });

/** The drafts a selection became, newest-first is meaningless here — one per Supplier, by name. */
export type PurchaseOrderSeedResult = z.infer<typeof PurchaseOrderSeedResult>;
export const PurchaseOrderSeedResult = z.object({
  purchaseOrders: z.array(z.object({ code: PurchaseOrderCode, id: UUID, supplierName: SupplierCompanyName })),
});
