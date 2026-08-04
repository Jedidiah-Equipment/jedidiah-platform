import { z } from 'zod';

import { DateOnlyIso } from '../common/date.js';
import { JobCode, PurchaseOrderCode } from '../common/public-code.js';
import { UUID } from '../common/uuid.js';
import { PartUnitOfMeasure } from '../parts/part.js';
import { PurchaseOrderQuantity } from '../purchase-orders/purchase-order.js';
import { SupplierCompanyName } from '../suppliers/supplier.js';

/**
 * Why a Part is on the buy list. One list carries all three rather than three screens (spec §12):
 * they are read by the same person on the same morning, and a Part is routinely more than one of
 * them at once.
 *
 * `notifies` marks the two that earn an interruption — an empty shelf and a breached reorder level
 * (spec §9, §12). A Part short for a Job three weeks out is procurement's ordinary work, so it
 * reaches the list without lighting the nav dot.
 */
export type BuyListReason = z.infer<typeof BuyListReason>;
export const BuyListReason = z.enum(['out-of-stock', 'negative-free', 'below-minimum']);

export const BUY_LIST_REASONS = {
  'below-minimum': { label: 'Below minimum', notifies: true },
  'negative-free': { label: 'Short for Jobs', notifies: false },
  'out-of-stock': { label: 'Out of stock', notifies: true },
} as const satisfies Record<BuyListReason, { label: string; notifies: boolean }>;

export function buyListReasonsNotify(reasons: readonly BuyListReason[]): boolean {
  return reasons.some((reason) => BUY_LIST_REASONS[reason].notifies);
}

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
  onOrder: z.number().finite(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  quantity: z.number().finite(),
  reasons: z.array(BuyListReason).min(1),
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

/** One ticked Part. `PurchaseOrderQuantity` is the same rule an edited draft line is held to. */
export type PurchaseOrderSelectionLine = z.infer<typeof PurchaseOrderSelectionLine>;
export const PurchaseOrderSelectionLine = z
  .object({
    partId: UUID,
    quantity: PurchaseOrderQuantity,
  })
  .strict();

/**
 * A ticked selection on its way to becoming drafts. The selection is deliberately supplier-blind —
 * the split into one draft per Supplier is the service's job, not the caller's (spec §4).
 */
export type PurchaseOrderSelectionInput = z.infer<typeof PurchaseOrderSelectionInput>;
export const PurchaseOrderSelectionInput = z
  .object({
    /** Seeded from a Job: every draft links back to it. Null when ticked off the buy list. */
    jobId: UUID.nullable().default(null),
    lines: z.array(PurchaseOrderSelectionLine).min(1, 'Select at least one Part'),
  })
  .strict()
  .refine((input) => new Set(input.lines.map((line) => line.partId)).size === input.lines.length, {
    message: 'A Part can appear only once in a selection',
    path: ['lines'],
  });

/** The drafts a selection became — one per Supplier, in the order the buyer is told about them. */
export type PurchaseOrderSelectionResult = z.infer<typeof PurchaseOrderSelectionResult>;
export const PurchaseOrderSelectionResult = z.object({
  purchaseOrders: z.array(z.object({ code: PurchaseOrderCode, id: UUID, supplierName: SupplierCompanyName })),
});
