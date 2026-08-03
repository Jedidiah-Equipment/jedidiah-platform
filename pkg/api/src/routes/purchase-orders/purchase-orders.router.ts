import {
  cancelPurchaseOrder,
  closePurchaseOrderShort,
  createPurchaseOrder,
  getPurchaseOrder,
  isPurchaseOrderCoreError,
  JobNotFoundError,
  listPurchaseOrders,
  markPurchaseOrderSent,
  type PurchaseOrderCoreError,
  postReceipt,
  savePurchaseOrderDraft,
} from '@pkg/core';
import { renderPurchaseOrderPdf } from '@pkg/pdf';
import {
  PostReceiptInput,
  type PurchaseOrder,
  PurchaseOrderActionInput,
  PurchaseOrderCreateInput,
  PurchaseOrderLineViewCostFields,
  PurchaseOrderListInput,
  PurchaseOrderListViewResult,
  PurchaseOrderSaveDraftInput,
  PurchaseOrderView,
  StockMovementPostResult,
} from '@pkg/schema';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, type InventoryCostAccess, projectInventoryCostFields, router } from '../../trpc/init.js';
import {
  assertCanWriteInventoryCost,
  mapStockMovementErrors,
  projectMovement,
} from '../inventory/stock-movement-transport.js';

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

  /** Close-short releases what will never come; the order keeps its receipts and its history. */
  closeShort: authorizedProcedure('purchase_order:close')
    .input(PurchaseOrderActionInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        closePurchaseOrderShort({ actorUserId: ctx.session.user.id, db: ctx.db, id: input.id }),
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

  /**
   * Receiving is the ledger write, never a paper-only action (spec §11). The dock confirms
   * quantities; a `unitCost` correction needs the cost gate open exactly as the revaluation and
   * opening-balance paths do, so a price-blind stores user receives on the PO line's own price.
   */
  receive: authorizedProcedure('purchase_order:receive')
    .input(PostReceiptInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      assertCanWriteInventoryCost(ctx.access, input.unitCost);

      const result = await mapReceiptErrors(() => postReceipt({ actorUserId: ctx.session.user.id, db: ctx.db, input }));

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
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

/** A receipt fails on either side of its seam: the order and line it attaches to, or the ledger rules. */
async function mapReceiptErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapStockMovementErrors(() => mapPurchaseOrderErrors(action));
}

function isPurchaseOrderJobError(error: unknown): error is JobNotFoundError {
  return error instanceof JobNotFoundError;
}

function mapPurchaseOrderJobError(error: JobNotFoundError): CoreErrorMapping<JobNotFoundError['code']> {
  return { appCode: error.code, code: 'NOT_FOUND', message: 'Job not found.' };
}

function mapPurchaseOrderCoreError(error: PurchaseOrderCoreError): CoreErrorMapping<PurchaseOrderCoreError['code']> {
  switch (error.code) {
    case 'purchase_order.line_not_found':
    case 'purchase_order.not_found':
    case 'purchase_order.part_not_found':
    case 'purchase_order.supplier_not_found':
      return { appCode: error.code, code: 'NOT_FOUND', message: error.message };
    case 'purchase_order.already_cancelled':
    case 'purchase_order.already_closed_short':
    case 'purchase_order.closed_short':
    case 'purchase_order.empty':
    case 'purchase_order.fully_received':
    case 'purchase_order.has_receipts':
    case 'purchase_order.invalid_quantity':
    case 'purchase_order.no_receipts':
    case 'purchase_order.not_draft':
    case 'purchase_order.not_sent':
    case 'purchase_order.part_not_purchasable':
    case 'purchase_order.part_supplier_mismatch':
      return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
    default:
      return assertNever(error);
  }
}
