import {
  type CreditNoteCoreError,
  isCreditNoteCoreError,
  isPurchaseOrderCoreError,
  isSupplierInvoiceCoreError,
  JobNotFoundError,
  type PurchaseOrderCoreError,
  type SupplierInvoiceCoreError,
} from '@pkg/core';

import { defineCoreErrorFamily } from '../../../trpc/errors.js';

/** Every Purchase Order failure already carries a public message; only the shape differs. */
export const purchaseOrderErrorFamily = defineCoreErrorFamily<PurchaseOrderCoreError>({
  codes: {
    'purchase_order.already_cancelled': 'BAD_REQUEST',
    'purchase_order.already_closed_short': 'BAD_REQUEST',
    'purchase_order.amendment_below_received': 'BAD_REQUEST',
    'purchase_order.closed_short': 'BAD_REQUEST',
    'purchase_order.empty': 'BAD_REQUEST',
    'purchase_order.fully_received': 'BAD_REQUEST',
    'purchase_order.has_receipts': 'BAD_REQUEST',
    'purchase_order.invalid_quantity': 'BAD_REQUEST',
    'purchase_order.line_exists': 'CONFLICT',
    'purchase_order.line_not_found': 'NOT_FOUND',
    'purchase_order.line_not_priced': 'BAD_REQUEST',
    'purchase_order.no_receipts': 'BAD_REQUEST',
    'purchase_order.not_approved': 'BAD_REQUEST',
    'purchase_order.not_draft': 'BAD_REQUEST',
    'purchase_order.not_found': 'NOT_FOUND',
    'purchase_order.not_sent': 'BAD_REQUEST',
    'purchase_order.part_not_found': 'NOT_FOUND',
    'purchase_order.part_not_purchasable': 'BAD_REQUEST',
    'purchase_order.part_supplier_mismatch': 'BAD_REQUEST',
    'purchase_order.substitution_has_receipts': 'CONFLICT',
    'purchase_order.supplier_not_found': 'NOT_FOUND',
  },
  is: isPurchaseOrderCoreError,
});

/** A credit note fails on the returns it claims, never on the document itself. */
export const creditNoteErrorFamily = defineCoreErrorFamily<CreditNoteCoreError>({
  codes: {
    'credit_note.already_settled': 'CONFLICT',
    'credit_note.return_not_found': 'NOT_FOUND',
  },
  is: isCreditNoteCoreError,
});

/**
 * The invoice panel fails on the flag being acted on, never on the extraction. An unreadable
 * invoice is a state the panel reports, not an error a procedure raises (spec §5).
 */
export const supplierInvoiceErrorFamily = defineCoreErrorFamily<SupplierInvoiceCoreError>({
  codes: {
    'invoice.flag_already_resolved': 'CONFLICT',
    'invoice.flag_not_found': 'NOT_FOUND',
    'invoice.not_found': 'NOT_FOUND',
    'invoice.price_not_applicable': 'BAD_REQUEST',
  },
  is: isSupplierInvoiceCoreError,
});

/** The one Job failure an order reaches, linking Jobs to a draft. */
export const purchaseOrderJobErrorFamily = defineCoreErrorFamily<JobNotFoundError>({
  codes: { 'job.not_found': 'NOT_FOUND' },
  is: (error): error is JobNotFoundError => error instanceof JobNotFoundError,
  messages: { 'job.not_found': 'Job not found.' },
});
