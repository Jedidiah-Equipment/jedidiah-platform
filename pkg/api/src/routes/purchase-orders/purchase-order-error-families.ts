import { isPurchaseOrderCoreError, JobNotFoundError, type PurchaseOrderCoreError } from '@pkg/core';

import { defineCoreErrorFamily } from '../../trpc/errors.js';

/** Every Purchase Order failure already carries a public message; only the shape differs. */
export const purchaseOrderErrorFamily = defineCoreErrorFamily<PurchaseOrderCoreError>({
  codes: {
    'purchase_order.already_cancelled': 'BAD_REQUEST',
    'purchase_order.already_closed_short': 'BAD_REQUEST',
    'purchase_order.closed_short': 'BAD_REQUEST',
    'purchase_order.empty': 'BAD_REQUEST',
    'purchase_order.fully_received': 'BAD_REQUEST',
    'purchase_order.has_receipts': 'BAD_REQUEST',
    'purchase_order.invalid_quantity': 'BAD_REQUEST',
    'purchase_order.line_not_found': 'NOT_FOUND',
    'purchase_order.no_receipts': 'BAD_REQUEST',
    'purchase_order.not_draft': 'BAD_REQUEST',
    'purchase_order.not_found': 'NOT_FOUND',
    'purchase_order.not_sent': 'BAD_REQUEST',
    'purchase_order.part_not_found': 'NOT_FOUND',
    'purchase_order.part_not_purchasable': 'BAD_REQUEST',
    'purchase_order.part_supplier_mismatch': 'BAD_REQUEST',
    'purchase_order.supplier_not_found': 'NOT_FOUND',
  },
  is: isPurchaseOrderCoreError,
});

/** The one Job failure an order reaches, linking Jobs to a draft. */
export const purchaseOrderJobErrorFamily = defineCoreErrorFamily<JobNotFoundError>({
  codes: { 'job.not_found': 'NOT_FOUND' },
  is: (error): error is JobNotFoundError => error instanceof JobNotFoundError,
  messages: { 'job.not_found': 'Job not found.' },
});
