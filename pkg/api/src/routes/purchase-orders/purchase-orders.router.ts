import {
  cancelPurchaseOrder,
  closePurchaseOrderShort,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  markPurchaseOrderSent,
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

import { mapCoreErrors } from '../../trpc/errors.js';
import { authorizedProcedure, type InventoryCostAccess, projectInventoryCostFields, router } from '../../trpc/init.js';
import { stockMovementErrorFamily } from '../inventory/inventory-error-families.js';
import { assertCanWriteInventoryCost, projectMovement } from '../inventory/stock-movement-transport.js';
import { purchaseOrderErrorFamily, purchaseOrderJobErrorFamily } from './purchase-order-error-families.js';

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

/** Editing an order reaches Jobs, since a draft carries Job links. */
async function mapPurchaseOrderErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, purchaseOrderErrorFamily, purchaseOrderJobErrorFamily);
}

/**
 * A receipt fails on either side of its seam: the order and line it attaches to, or the ledger rules.
 *
 * Deliberately *not* the Job family the rest of this router carries. `postReceipt` never reaches a
 * Job — stock arrives against an order, and which Jobs that order was raised for has nothing to do
 * with what turned up at the dock — so listing it here would claim a failure that cannot happen.
 */
async function mapReceiptErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, purchaseOrderErrorFamily, stockMovementErrorFamily);
}
