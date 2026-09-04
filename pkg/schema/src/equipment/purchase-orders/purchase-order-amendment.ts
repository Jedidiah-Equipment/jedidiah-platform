import { z } from 'zod';

import { AuthId } from '../../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { PurchaseOrderQuantity, PurchaseOrderUnitPrice } from './purchase-order.js';

/**
 * The four ways a sent order actually changes (spec §4): a line changes, or the Supplier changes
 * the day it promised the order. Anything wider than this is a new order.
 */
export type PurchaseOrderAmendmentKind = z.infer<typeof PurchaseOrderAmendmentKind>;
export const PurchaseOrderAmendmentKind = z.enum([
  'quantity-change',
  'add-line',
  'substitute-part',
  'expected-date-change',
]);

export const PURCHASE_ORDER_AMENDMENT_KIND_LABELS = {
  'add-line': 'Line added',
  'expected-date-change': 'Expected date changed',
  'quantity-change': 'Quantity changed',
  'substitute-part': 'Part substituted',
} as const satisfies Record<PurchaseOrderAmendmentKind, string>;

/**
 * Mandatory on every amendment. The phone call that changed the order is the recorded event, and a
 * quantity moving on its own says nothing about who agreed to it or why.
 */
export type PurchaseOrderAmendmentNote = z.infer<typeof PurchaseOrderAmendmentNote>;
export const PurchaseOrderAmendmentNote = requiredTrimmedText('Record why this order changed');

const AmendmentBaseInput = z.object({
  id: UUID,
  note: PurchaseOrderAmendmentNote,
});

export type PurchaseOrderAmendQuantityInput = z.infer<typeof PurchaseOrderAmendQuantityInput>;
export const PurchaseOrderAmendQuantityInput = AmendmentBaseInput.extend({
  partId: UUID,
  quantity: PurchaseOrderQuantity,
}).strict();

export type PurchaseOrderAmendAddLineInput = z.infer<typeof PurchaseOrderAmendAddLineInput>;
export const PurchaseOrderAmendAddLineInput = AmendmentBaseInput.extend({
  partId: UUID,
  quantity: PurchaseOrderQuantity,
  unitPrice: PurchaseOrderUnitPrice,
}).strict();

/**
 * `partId` is the line being replaced and `newPartId` what takes its place; the substitute carries
 * its own quantity and price because the call that agreed the swap agreed those too.
 */
export type PurchaseOrderAmendSubstitutePartInput = z.infer<typeof PurchaseOrderAmendSubstitutePartInput>;
export const PurchaseOrderAmendSubstitutePartInput = AmendmentBaseInput.extend({
  newPartId: UUID,
  partId: UUID,
  quantity: PurchaseOrderQuantity,
  unitPrice: PurchaseOrderUnitPrice,
})
  .strict()
  .refine((input) => input.newPartId !== input.partId, {
    message: 'Choose a different Part to substitute in',
    path: ['newPartId'],
  });

export type PurchaseOrderAmendExpectedDateInput = z.infer<typeof PurchaseOrderAmendExpectedDateInput>;
export const PurchaseOrderAmendExpectedDateInput = AmendmentBaseInput.extend({
  expectedDeliveryDate: DateOnlyIso,
}).strict();

/**
 * One logged change to a sent order. The log is the record — insert-only, never edited — while the
 * change itself has already been applied to the order's lines in the same transaction.
 */
export type PurchaseOrderAmendment = z.infer<typeof PurchaseOrderAmendment>;
export const PurchaseOrderAmendment = z.object({
  actorName: z.string().trim().min(1).nullable(),
  actorUserId: AuthId,
  createdAt: DateIso,
  id: UUID,
  kind: PurchaseOrderAmendmentKind,
  newExpectedDate: DateOnlyIso.nullable(),
  newPartCode: z.string().nullable(),
  newPartId: UUID.nullable(),
  newPartName: z.string().nullable(),
  /** The line's quantity after a line amendment; a date amendment carries no quantity. */
  newQuantity: z.number().finite().nullable(),
  note: PurchaseOrderAmendmentNote,
  oldExpectedDate: DateOnlyIso.nullable(),
  /** The earlier line quantity; null for an added line and for a date amendment. */
  oldQuantity: z.number().finite().nullable(),
  partCode: z.string().nullable(),
  partId: UUID.nullable(),
  partName: z.string().nullable(),
});

export type PurchaseOrderAmendmentListResult = z.infer<typeof PurchaseOrderAmendmentListResult>;
export const PurchaseOrderAmendmentListResult = z.object({ items: z.array(PurchaseOrderAmendment) });
