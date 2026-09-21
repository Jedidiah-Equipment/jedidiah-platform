import { DateOnlyIso, DateOnlyIsoString, UUID } from '@pkg/schema';
import {
  hasUniquePartIds,
  InventoryUnitCost,
  type Part,
  PostReceiptInput,
  PostReturnToSupplierInput,
  PURCHASE_ORDER_DUPLICATE_PART_MESSAGE,
  type PurchaseOrderAmendmentKind,
  PurchaseOrderAmendmentNote,
  type PurchaseOrderCreateInput,
  PurchaseOrderCustomLineDescription,
  PurchaseOrderCustomLineInput,
  PurchaseOrderCustomLineSupplierCode,
  PurchaseOrderCustomLineUnit,
  type PurchaseOrderLineView,
  PurchaseOrderPartLineInput,
  type PurchaseOrderPartLineView,
  PurchaseOrderQuantity,
  type PurchaseOrderSaveDraftInput,
  PurchaseOrderUnitPrice,
  type PurchaseOrderView,
  StockMovementLengthMm,
  StockMovementQuantity,
  StockReturnToSupplierReason,
  unitClassFor,
} from '@pkg/schema/equipment';
import { z } from 'zod';

import { roundNumberFieldValue } from '@/components/form/fields/NumberField.js';
import { emptyStringOr, optionalNumber, requiredSelection } from '@/components/form/utils/form-schema.js';

export type PurchaseOrderCreateFormValues = z.infer<typeof PurchaseOrderCreateFormValues>;
export const PurchaseOrderCreateFormValues = z.object({
  expectedDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
  supplierId: UUID,
});

/** The whole editable draft: header, lines, and Job links move together through one save. */
export type PurchaseOrderDraftFormValues = z.infer<typeof PurchaseOrderDraftFormValues>;
export const PurchaseOrderDraftFormValues = PurchaseOrderCreateFormValues.extend({
  jobIds: z.array(UUID),
  // An added line starts with no Part, so it holds the draft unsaved with "Select a part" until one is picked.
  lines: z.array(
    z.discriminatedUnion('kind', [
      PurchaseOrderPartLineInput.extend({ partId: requiredSelection(UUID, 'Select a part') }),
      PurchaseOrderCustomLineInput.extend({ supplierCode: emptyStringOr(PurchaseOrderCustomLineSupplierCode) }),
    ]),
  ),
  // Mirrors PurchaseOrderSaveDraftInput so a duplicate Part fails validation here rather than
  // autosaving into a server rejection the reader cannot trace back to a row.
}).refine((values) => hasUniquePartIds(values.lines), {
  message: PURCHASE_ORDER_DUPLICATE_PART_MESSAGE,
  path: ['lines'],
});

/**
 * The decimals a draft line's quantity is keyed and kept in: three where `PurchaseOrderQuantity`
 * allows them, none where the server counts whole units — the same `unitClassFor` verdict it raises
 * `PurchaseOrderInvalidQuantityError` on. A Part that has not resolved yet declares no precision at
 * all; the Parts query is still in flight, and rounding on that guess would round a measured
 * quantity away.
 */
export function quantityDecimals(part: Pick<Part, 'unitOfMeasure'> | undefined): number | undefined {
  if (!part) return undefined;

  return unitClassFor(part.unitOfMeasure) === 'measured' ? 3 : 0;
}

/**
 * What a line's quantity becomes when its Part changes: 7.5 kg swapped for a Part counted in pieces
 * is 8 of them. The picker settles this itself because the autosave flush is one microtask behind it,
 * and the field's own rounding is a render pass behind that — long enough to post the old number
 * against the new Part and earn a refusal the row does not look like it deserves.
 */
export function quantityForPart(quantity: number, part: Pick<Part, 'unitOfMeasure'> | undefined): number {
  return roundNumberFieldValue(quantity, quantityDecimals(part));
}

export function toPurchaseOrderCreateInput(values: PurchaseOrderCreateFormValues): PurchaseOrderCreateInput {
  return {
    expectedDeliveryDate: toExpectedDeliveryDate(values.expectedDeliveryDate),
    supplierId: values.supplierId,
  };
}

export function toPurchaseOrderDraftFormValues(purchaseOrder: PurchaseOrderView): PurchaseOrderDraftFormValues {
  return {
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate ?? '',
    jobIds: purchaseOrder.jobs.map((job) => job.id),
    // A price-blind reader never reaches the editable form, so a stored line always has its price.
    lines: purchaseOrder.lines.map((line) =>
      line.kind === 'custom'
        ? {
            description: line.description,
            id: line.id,
            kind: 'custom' as const,
            quantity: line.quantity,
            supplierCode: line.supplierCode ?? '',
            unit: line.unit,
            unitPrice: line.unitPrice ?? 0,
          }
        : {
            kind: 'part' as const,
            partId: line.partId,
            quantity: line.quantity,
            unitPrice: line.unitPrice ?? 0,
          },
    ),
    supplierId: purchaseOrder.supplierId,
  };
}

export function toPurchaseOrderDraftInput(
  id: PurchaseOrderView['id'],
  values: PurchaseOrderDraftFormValues,
): PurchaseOrderSaveDraftInput {
  return {
    expectedDeliveryDate: toExpectedDeliveryDate(values.expectedDeliveryDate),
    id,
    jobIds: values.jobIds,
    lines: values.lines.map((line) =>
      line.kind === 'custom' ? { ...line, supplierCode: line.supplierCode || null } : line,
    ),
    supplierId: values.supplierId,
  };
}

function toExpectedDeliveryDate(value: string) {
  return value ? DateOnlyIso.parse(value) : null;
}

/** What the dock keys in. Every rule beyond the length being optional stays owned by `@pkg/schema`. */
export type PurchaseOrderReceiveFormValues = z.infer<typeof PurchaseOrderReceiveFormValues>;
export const PurchaseOrderReceiveFormValues = z.object({
  lengthMm: optionalNumber(StockMovementLengthMm),
  quantity: StockMovementQuantity,
  unitCost: optionalNumber(InventoryUnitCost),
});

/** The outstanding quantity a line is still waiting on, floored at zero once it is over-delivered. */
export function outstandingQuantity(line: Pick<PurchaseOrderLineView, 'quantity' | 'receivedQuantity'>): number {
  return Math.max(0, line.quantity - line.receivedQuantity);
}

export function isLinearLine(line: Pick<PurchaseOrderPartLineView, 'unitOfMeasure'>): boolean {
  return line.unitOfMeasure === 'mm';
}

/** The server's amendment kinds, with the one the log folds into `add-line` told apart for the form. */
export type PurchaseOrderAmendDialogKind = PurchaseOrderAmendmentKind | 'add-custom-line';

/**
 * What the buyer keys when the phone call ends. The note is mandatory on every kind, so the form
 * carries the schema's own rule rather than a second one — the call *is* the record (spec §4).
 */
export type PurchaseOrderAmendmentFormValues = z.infer<typeof PurchaseOrderAmendmentFormValues>;
export const PurchaseOrderAmendmentFormValues = z.object({
  description: z.union([z.literal(''), PurchaseOrderCustomLineDescription]),
  expectedDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
  newPartId: z.union([z.literal(''), UUID]),
  note: PurchaseOrderAmendmentNote,
  quantity: PurchaseOrderQuantity,
  supplierCode: emptyStringOr(PurchaseOrderCustomLineSupplierCode),
  unit: z.union([z.literal(''), PurchaseOrderCustomLineUnit]),
  unitPrice: PurchaseOrderUnitPrice,
});

type PurchaseOrderAmendmentField = Exclude<keyof PurchaseOrderAmendmentFormValues, 'note'>;

/**
 * The one form serves every kind, and a kind is nothing more than the fields it asks the buyer for.
 * The dialog renders from this and the validator insists on it, so the two cannot disagree.
 */
export const PURCHASE_ORDER_AMENDMENT_FIELDS: Record<
  PurchaseOrderAmendDialogKind,
  readonly PurchaseOrderAmendmentField[]
> = {
  'add-custom-line': ['description', 'unit', 'supplierCode', 'quantity', 'unitPrice'],
  'add-line': ['newPartId', 'quantity', 'unitPrice'],
  'expected-date-change': ['expectedDeliveryDate'],
  'quantity-change': ['quantity'],
  'remove-line': [],
  'substitute-part': ['newPartId', 'quantity', 'unitPrice'],
};

/** A field the form holds as `''` until it is keyed must be filled once a kind asks for it. */
const REQUIRED_WHEN_ASKED: Partial<Record<PurchaseOrderAmendmentField, z.ZodType>> = {
  description: PurchaseOrderCustomLineDescription,
  expectedDeliveryDate: requiredSelection(DateOnlyIsoString, 'Choose an expected delivery date'),
  newPartId: requiredSelection(UUID, 'Choose a Part'),
  unit: PurchaseOrderCustomLineUnit,
};

export function purchaseOrderAmendmentValidator(
  kind: PurchaseOrderAmendDialogKind,
): z.ZodType<PurchaseOrderAmendmentFormValues, PurchaseOrderAmendmentFormValues> {
  return PurchaseOrderAmendmentFormValues.superRefine((values, context) => {
    for (const field of PURCHASE_ORDER_AMENDMENT_FIELDS[kind]) {
      const issue = REQUIRED_WHEN_ASKED[field]?.safeParse(values[field]).error?.issues[0];
      if (issue) context.addIssue({ code: 'custom', message: issue.message, path: [field] });
    }
  });
}

/** What goes back to the Supplier. The value is never keyed — the ledger takes it off the receipts. */
export type PurchaseOrderReturnFormValues = z.infer<typeof PurchaseOrderReturnFormValues>;
export const PurchaseOrderReturnFormValues = z.object({
  lengthMm: optionalNumber(StockMovementLengthMm),
  note: z.string(),
  quantity: StockMovementQuantity,
  reason: StockReturnToSupplierReason,
});

export function toReturnToSupplierInput({
  line,
  purchaseOrderId,
  values,
}: {
  line: Pick<PurchaseOrderPartLineView, 'partId' | 'unitOfMeasure'>;
  purchaseOrderId: PurchaseOrderView['id'];
  values: PurchaseOrderReturnFormValues;
}) {
  return PostReturnToSupplierInput.parse({
    lengthMm: isLinearLine(line) && !Number.isNaN(values.lengthMm) ? values.lengthMm : null,
    note: values.note,
    partId: line.partId,
    purchaseOrderId,
    quantity: values.quantity,
    reason: values.reason,
  });
}

/**
 * What this line can still send back in the bucket a return of this length would post against. The
 * figure is served by `purchaseOrders.get`, computed by the same pool the post sums under its lock —
 * read rather than re-derived, because a threshold computed here from netted totals is what let the
 * dialog confirm one number while the post warned about another.
 */
export function outstandingReceivedForLength({
  lengthMm,
  line,
}: {
  lengthMm: number | null;
  line: Pick<PurchaseOrderPartLineView, 'receiptBuckets' | 'standardPurchaseLengthMm' | 'unitOfMeasure'>;
}): number {
  // A return keys nothing for a Part bought in one standard length; a short piece keys its own.
  const bucketLength = line.unitOfMeasure === 'mm' ? (lengthMm ?? line.standardPurchaseLengthMm) : null;

  return line.receiptBuckets.find((bucket) => bucket.lengthMm === bucketLength)?.outstandingReceivedQuantity ?? 0;
}

/** The line's whole outstanding total across every bucket — what is still on hand from this order. */
export function outstandingReceivedForLine(line: Pick<PurchaseOrderPartLineView, 'receiptBuckets'>): number {
  return line.receiptBuckets.reduce((total, bucket) => total + bucket.outstandingReceivedQuantity, 0);
}

/**
 * A blank length on a linear line means "the length we buy it in", which the ledger fills from the
 * Part's standard purchase length — so the dock only keys one when the delivery is not that.
 */
export function toReceiptInput({
  canReadCosts,
  line,
  purchaseOrderId,
  values,
}: {
  canReadCosts: boolean;
  line: Pick<PurchaseOrderPartLineView, 'partId' | 'unitOfMeasure'>;
  purchaseOrderId: PurchaseOrderView['id'];
  values: PurchaseOrderReceiveFormValues;
}) {
  return PostReceiptInput.parse({
    lengthMm: isLinearLine(line) && !Number.isNaN(values.lengthMm) ? values.lengthMm : null,
    partId: line.partId,
    purchaseOrderId,
    quantity: values.quantity,
    unitCost: canReadCosts && !Number.isNaN(values.unitCost) ? values.unitCost : null,
  });
}

export function purchaseOrderLinesTotal(lines: ReadonlyArray<{ quantity: number; unitPrice: number | null }>): number {
  return lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice ?? 0), 0);
}
