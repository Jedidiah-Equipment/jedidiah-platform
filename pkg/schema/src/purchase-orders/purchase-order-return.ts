import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { PurchaseOrderCode } from '../common/public-code.js';
import { nullableTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';
import { PurchaseOrderDocumentType } from '../documents/document.js';
import { declareInventoryCostFields, InventoryValue } from '../inventory/inventory-cost.js';
import { StockMovementLengthMm, StockReturnToSupplierReason } from '../inventory/stock-movement.js';
import { SupplierCompanyName } from '../suppliers/supplier.js';

/**
 * One `return-to-supplier` movement on an order, with whether a credit note has answered it yet.
 *
 * The settlement is read from the credit note's own reference rather than stored on the movement:
 * ledger rows are immutable, so "this has been credited" can only ever be a fact about the document
 * (spec §4).
 */
export type PurchaseOrderReturnRow = z.infer<typeof PurchaseOrderReturnRow>;
export const PurchaseOrderReturnRow = z.object({
  actorName: z.string().trim().min(1).nullable(),
  createdAt: DateIso,
  id: UUID,
  lengthMm: StockMovementLengthMm.nullable(),
  note: nullableTrimmedText(),
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  /** Positive: what physically went back, the movement's own delta being negative. */
  quantity: z.number().finite().positive(),
  reason: StockReturnToSupplierReason,
  settledByDocumentFilename: z.string().nullable(),
  settledByDocumentId: UUID.nullable(),
  /** The value reversed, at the stamped receipt cost the return was posted with. */
  value: InventoryValue,
});

export const PurchaseOrderReturnRowCostFields = declareInventoryCostFields(PurchaseOrderReturnRow, 'value');

export type PurchaseOrderReturnListResult = z.infer<typeof PurchaseOrderReturnListResult>;
export const PurchaseOrderReturnListResult = z.object({ items: z.array(PurchaseOrderReturnRow) });

/**
 * A return nobody has credited yet, plant-wide (spec §12). Keyed per movement rather than per
 * order: a PO-level "has a credit note" test goes blind after the first credit on an order that
 * sent two things back.
 */
export type ReturnAwaitingCreditRow = z.infer<typeof ReturnAwaitingCreditRow>;
export const ReturnAwaitingCreditRow = z.object({
  createdAt: DateIso,
  daysOutstanding: z.int().min(0),
  id: UUID,
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  purchaseOrderCode: PurchaseOrderCode,
  purchaseOrderId: UUID,
  quantity: z.number().finite().positive(),
  reason: StockReturnToSupplierReason,
  supplierName: SupplierCompanyName,
  value: InventoryValue,
});

export const ReturnAwaitingCreditRowCostFields = declareInventoryCostFields(ReturnAwaitingCreditRow, 'value');

export type ReturnsAwaitingCreditResult = z.infer<typeof ReturnsAwaitingCreditResult>;
export const ReturnsAwaitingCreditResult = z.object({ items: z.array(ReturnAwaitingCreditRow) });

/** A read scoped to one order's collection — its amendments, documents, or returns. */
export type PurchaseOrderCollectionInput = z.infer<typeof PurchaseOrderCollectionInput>;
export const PurchaseOrderCollectionInput = z.object({ purchaseOrderId: UUID }).strict();

/**
 * What a credit-note upload settles. At least one return is required: the whole point of the
 * document is the reference it carries, and a credit note settling nothing would sit in the
 * collection while the returns it answers stayed on the awaiting-credit list forever.
 */
export type CreditNoteSettlementInput = z.infer<typeof CreditNoteSettlementInput>;
export const CreditNoteSettlementInput = z
  .object({
    purchaseOrderId: UUID,
    stockMovementIds: z.array(UUID).min(1, 'Select at least one return this credit note settles'),
  })
  .strict()
  .refine((input) => new Set(input.stockMovementIds).size === input.stockMovementIds.length, {
    message: 'A return can be settled only once by one credit note',
    path: ['stockMovementIds'],
  });

/** One document in an order's collection: its PDF revisions and the credit notes filed against it. */
export type PurchaseOrderDocumentRow = z.infer<typeof PurchaseOrderDocumentRow>;
export const PurchaseOrderDocumentRow = z.object({
  byteSize: z.int().min(0),
  createdAt: DateIso,
  filename: z.string(),
  id: UUID,
  /** The revision number of a generated PO PDF; a credit note is not a revision of anything. */
  revision: z.int().min(1).nullable(),
  settledReturnIds: z.array(UUID),
  type: PurchaseOrderDocumentType,
  uploaderName: z.string().trim().min(1).nullable(),
});

export type PurchaseOrderDocumentListResult = z.infer<typeof PurchaseOrderDocumentListResult>;
export const PurchaseOrderDocumentListResult = z.object({ items: z.array(PurchaseOrderDocumentRow) });
