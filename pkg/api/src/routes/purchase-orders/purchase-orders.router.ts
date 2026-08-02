import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  isPurchaseOrderCoreError,
  JobNotFoundError,
  listPurchaseOrders,
  markPurchaseOrderSent,
  type PurchaseOrderCoreError,
  replacePurchaseOrderJobLinks,
  replacePurchaseOrderLines,
  updatePurchaseOrderHeader,
} from '@pkg/core';
import { renderPurchaseOrderPdf } from '@pkg/pdf';
import {
  PurchaseOrder,
  PurchaseOrderActionInput,
  PurchaseOrderCreateInput,
  PurchaseOrderListInput,
  PurchaseOrderListResult,
  PurchaseOrderReplaceJobLinksInput,
  PurchaseOrderReplaceLinesInput,
  PurchaseOrderUpdateHeaderInput,
} from '@pkg/schema';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, projectInventoryCostFields, router } from '../../trpc/init.js';

export const purchaseOrdersRouter = router({
  cancel: authorizedProcedure('purchase_order:close')
    .input(PurchaseOrderActionInput)
    .output(PurchaseOrder)
    .mutation(({ ctx, input }) =>
      mapPurchaseOrderErrors(() =>
        cancelPurchaseOrder({ actorUserId: ctx.session.user.id, db: ctx.db, id: input.id }),
      ).then((purchaseOrder) => projectPurchaseOrder(purchaseOrder, ctx.access)),
    ),

  create: authorizedProcedure('purchase_order:create')
    .input(PurchaseOrderCreateInput)
    .output(PurchaseOrder)
    .mutation(({ ctx, input }) =>
      mapPurchaseOrderErrors(() => createPurchaseOrder({ actorUserId: ctx.session.user.id, db: ctx.db, input })).then(
        (purchaseOrder) => projectPurchaseOrder(purchaseOrder, ctx.access),
      ),
    ),

  get: authorizedProcedure('purchase_order:read')
    .input(PurchaseOrderActionInput)
    .output(PurchaseOrder)
    .query(({ ctx, input }) =>
      mapPurchaseOrderErrors(() => getPurchaseOrder({ db: ctx.db, id: input.id })).then((purchaseOrder) =>
        projectPurchaseOrder(purchaseOrder, ctx.access),
      ),
    ),

  list: authorizedProcedure('purchase_order:read')
    .input(PurchaseOrderListInput)
    .output(PurchaseOrderListResult)
    .query(async ({ ctx, input }) => {
      const result = await listPurchaseOrders({ db: ctx.db, input });
      return { ...result, items: result.items.map((purchaseOrder) => projectPurchaseOrder(purchaseOrder, ctx.access)) };
    }),

  markSent: authorizedProcedure('purchase_order:send')
    .input(PurchaseOrderActionInput)
    .output(PurchaseOrder)
    .mutation(({ ctx, input }) =>
      mapPurchaseOrderErrors(() =>
        markPurchaseOrderSent({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
          pdfRenderer: renderPurchaseOrderPdf,
          storage: ctx.storage,
        }),
      ).then((purchaseOrder) => projectPurchaseOrder(purchaseOrder, ctx.access)),
    ),

  replaceJobLinks: authorizedProcedure('purchase_order:create')
    .input(PurchaseOrderReplaceJobLinksInput)
    .output(PurchaseOrder)
    .mutation(({ ctx, input }) =>
      mapPurchaseOrderErrors(() =>
        replacePurchaseOrderJobLinks({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      ).then((purchaseOrder) => projectPurchaseOrder(purchaseOrder, ctx.access)),
    ),

  replaceLines: authorizedProcedure('purchase_order:create')
    .input(PurchaseOrderReplaceLinesInput)
    .output(PurchaseOrder)
    .mutation(({ ctx, input }) =>
      mapPurchaseOrderErrors(() =>
        replacePurchaseOrderLines({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      ).then((purchaseOrder) => projectPurchaseOrder(purchaseOrder, ctx.access)),
    ),

  updateHeader: authorizedProcedure('purchase_order:create')
    .input(PurchaseOrderUpdateHeaderInput)
    .output(PurchaseOrder)
    .mutation(({ ctx, input }) =>
      mapPurchaseOrderErrors(() =>
        updatePurchaseOrderHeader({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      ).then((purchaseOrder) => projectPurchaseOrder(purchaseOrder, ctx.access)),
    ),
});

function projectPurchaseOrder<T extends PurchaseOrder>(
  purchaseOrder: T,
  access: Parameters<typeof projectInventoryCostFields>[0]['access'],
): T {
  return {
    ...purchaseOrder,
    lines: purchaseOrder.lines.map((line) =>
      projectInventoryCostFields({ access, costFields: ['unitPrice'], output: line }),
    ),
  };
}

async function mapPurchaseOrderErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(
    () => mapKnownCoreError(action, isPurchaseOrderJobError, mapPurchaseOrderJobError),
    isPurchaseOrderCoreError,
    mapPurchaseOrderCoreError,
  );
}

function isPurchaseOrderJobError(error: unknown): error is JobNotFoundError {
  return error instanceof JobNotFoundError;
}

function mapPurchaseOrderJobError(error: JobNotFoundError): CoreErrorMapping<JobNotFoundError['code']> {
  return { appCode: error.code, code: 'NOT_FOUND', message: 'Job not found.' };
}

function mapPurchaseOrderCoreError(error: PurchaseOrderCoreError): CoreErrorMapping<PurchaseOrderCoreError['code']> {
  switch (error.code) {
    case 'purchase_order.not_found':
    case 'purchase_order.part_not_found':
    case 'purchase_order.supplier_not_found':
      return { appCode: error.code, code: 'NOT_FOUND', message: error.message };
    case 'purchase_order.already_cancelled':
    case 'purchase_order.empty':
    case 'purchase_order.has_receipts':
    case 'purchase_order.invalid_quantity':
    case 'purchase_order.not_draft':
    case 'purchase_order.part_supplier_mismatch':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    default:
      return assertNever(error);
  }
}
