import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  isPurchaseOrderCoreError,
  JobNotFoundError,
  listPurchaseOrders,
  markPurchaseOrderSent,
  type PurchaseOrderCoreError,
  savePurchaseOrderDraft,
} from '@pkg/core';
import { renderPurchaseOrderPdf } from '@pkg/pdf';
import {
  type PurchaseOrder,
  PurchaseOrderActionInput,
  PurchaseOrderCreateInput,
  PurchaseOrderLineViewCostFields,
  PurchaseOrderListInput,
  PurchaseOrderListViewResult,
  PurchaseOrderSaveDraftInput,
  PurchaseOrderView,
} from '@pkg/schema';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, type InventoryCostAccess, projectInventoryCostFields, router } from '../../trpc/init.js';

export const purchaseOrdersRouter = router({
  cancel: authorizedProcedure('purchase_order:close')
    .input(PurchaseOrderActionInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        cancelPurchaseOrder({ actorUserId: ctx.session.user.id, db: ctx.db, id: input.id }),
      );

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),

  create: authorizedProcedure('purchase_order:create')
    .input(PurchaseOrderCreateInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        createPurchaseOrder({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),

  get: authorizedProcedure('purchase_order:read')
    .input(PurchaseOrderActionInput)
    .output(PurchaseOrderView)
    .query(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() => getPurchaseOrder({ db: ctx.db, id: input.id }));

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),

  list: authorizedProcedure('purchase_order:read')
    .input(PurchaseOrderListInput)
    .output(PurchaseOrderListViewResult)
    .query(async ({ ctx, input }) => {
      const result = await listPurchaseOrders({ db: ctx.db, input });

      return { ...result, items: result.items.map((purchaseOrder) => toPurchaseOrderView(purchaseOrder, ctx.access)) };
    }),

  markSent: authorizedProcedure('purchase_order:send')
    .input(PurchaseOrderActionInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        markPurchaseOrderSent({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
          pdfRenderer: renderPurchaseOrderPdf,
          storage: ctx.storage,
        }),
      );

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),

  saveDraft: authorizedProcedure('purchase_order:create')
    .input(PurchaseOrderSaveDraftInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        savePurchaseOrderDraft({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),
});

/** The only path from the core order to what the API serves, so a line price cannot escape the gate. */
function toPurchaseOrderView(purchaseOrder: PurchaseOrder, access: InventoryCostAccess) {
  return {
    ...purchaseOrder,
    lines: purchaseOrder.lines.map((line) =>
      projectInventoryCostFields({ access, costFields: PurchaseOrderLineViewCostFields, output: line }),
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
