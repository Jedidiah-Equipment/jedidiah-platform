import { z } from 'zod';

import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { StockMovementWarningCode } from '../inventory/stock-movement.js';

export const PurchaseOrderArrivalQuantity = z
  .number()
  .finite()
  .min(-99_999_999_999.999, 'Quantity exceeds the supported range')
  .max(99_999_999_999.999, 'Quantity exceeds the supported range')
  .multipleOf(0.001, 'Quantity supports at most three decimal places')
  .refine((quantity) => quantity !== 0, 'Quantity cannot be zero');

export type PostArrivalInput = z.infer<typeof PostArrivalInput>;
export const PostArrivalInput = z
  .object({
    lineId: UUID,
    note: z.string().trim().min(1).max(500).nullable().default(null),
    purchaseOrderId: UUID,
    quantity: PurchaseOrderArrivalQuantity,
  })
  .strict()
  .refine((input) => input.quantity > 0 || input.note !== null, {
    message: 'Record why this arrival is being reversed',
    path: ['note'],
  });

export type PurchaseOrderArrival = z.infer<typeof PurchaseOrderArrival>;
export const PurchaseOrderArrival = z.object({
  actorName: z.string().trim().min(1).nullable(),
  actorUserId: AuthId,
  createdAt: DateIso,
  id: UUID,
  lineDescription: z.string().trim().min(1),
  lineId: UUID,
  note: z.string().nullable(),
  quantity: z.number().finite(),
});

export type PurchaseOrderArrivalListResult = z.infer<typeof PurchaseOrderArrivalListResult>;
export const PurchaseOrderArrivalListResult = z.object({ items: z.array(PurchaseOrderArrival) });

export type PostArrivalResult = z.infer<typeof PostArrivalResult>;
export const PostArrivalResult = z.object({
  arrival: PurchaseOrderArrival,
  warnings: z.array(StockMovementWarningCode),
});
