import { z } from 'zod';
import { UUID } from '../../common/uuid.js';
import { JobCode } from '../common/public-code.js';
import { StockMovementLengthMm } from '../inventory/stock-movement.js';
import { JobDescription } from '../jobs/job.js';
import { PartUnitOfMeasure } from '../parts/part.js';

/**
 * The machine a cancellation is about to decide the fate of, as the dialog needs to describe it. The
 * server answers both halves — whether removal may be offered at all, and whether it should arrive
 * already ticked — so the two cancel surfaces cannot reach different conclusions from the same facts.
 */
export type CancellationLinkedUnit = z.infer<typeof CancellationLinkedUnit>;
export const CancellationLinkedUnit = z.object({
  canRemove: z.boolean(),
  // The Customer holding the machine, or null for Stock. Shown so nobody removes a serial without
  // seeing whose machine the system currently thinks it is.
  ownerName: z.string().nullable(),
  productSerialNumber: z.string(),
  productUnitId: UUID,
  removeByDefault: z.boolean(),
});

/** What cancelling this Quote reaches: the live Job it would take with it, and that Job's machine. */
export type QuoteCancellationPlan = z.infer<typeof QuoteCancellationPlan>;
export const QuoteCancellationPlan = z.object({
  /** Stock still out against a Parts Sale. Named so the person cancelling knows it is there; never a block. */
  drawnStock: z
    .array(
      z.object({
        lengthMm: StockMovementLengthMm.nullable(),
        outstandingQuantity: z.number().finite(),
        partCode: z.string(),
        partName: z.string(),
        unitOfMeasure: PartUnitOfMeasure,
      }),
    )
    .default([]),
  job: z
    .object({
      code: JobCode,
      description: JobDescription,
      id: UUID,
      releasableSlotCount: z.number().int().min(0),
    })
    .nullable(),
  // Present only for a Stock Build's own machine — see `getQuoteCancellationPlan`.
  unit: CancellationLinkedUnit.nullable(),
});

/** What cancelling this Job reaches. Its Quote, if any, is deliberately left alone. */
export type JobCancellationPlan = z.infer<typeof JobCancellationPlan>;
export const JobCancellationPlan = z.object({
  releasableSlotCount: z.number().int().min(0),
  unit: CancellationLinkedUnit.nullable(),
});
