import { z } from 'zod';
import { UUID } from '../../common/uuid.js';
import { Money } from './job.js';
import { discountKinds } from './job-enums.js';

/** A null rateId is No charge. */
export const StintRateSetInput = z.object({ assignmentId: UUID, rateId: UUID.nullable() }).strict();
export type StintRateSetInput = z.infer<typeof StintRateSetInput>;
/** Returns the stint to un-priced. */
export const StintRateClearInput = z.object({ assignmentId: UUID }).strict();
export type StintRateClearInput = z.infer<typeof StintRateClearInput>;
/** A null finalAmount resets the stint to its computed amount. */
export const StintAmountSetInput = z.object({ assignmentId: UUID, finalAmount: Money.nullable() }).strict();
export type StintAmountSetInput = z.infer<typeof StintAmountSetInput>;
/** A null unitPrice clears Diesel pricing; an omitted or null amount computes from litres × unitPrice. */
export const DieselPriceInput = z
  .object({ jobId: UUID, unitPrice: Money.nullable(), amount: Money.nullable().optional() })
  .strict();
export type DieselPriceInput = z.infer<typeof DieselPriceInput>;
export const JobDiscountInput = z
  .object({ kind: z.enum(discountKinds), value: Money })
  .strict()
  .refine((discount) => discount.kind !== 'percent' || discount.value <= 100, {
    path: ['value'],
    message: 'A percentage discount cannot exceed 100',
  });
export const DiscountSetInput = z.object({ jobId: UUID, discount: JobDiscountInput.nullable() }).strict();
export type DiscountSetInput = z.infer<typeof DiscountSetInput>;
/** expectedTotal is the figure on the pricer's screen; a mismatch means something moved underneath them. */
export const JobMarkPricedInput = z.object({ id: UUID, expectedTotal: Money }).strict();
export type JobMarkPricedInput = z.infer<typeof JobMarkPricedInput>;
