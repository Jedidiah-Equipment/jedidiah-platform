import {
  amendPurchaseOrderAddLine,
  amendPurchaseOrderExpectedDate,
  amendPurchaseOrderQuantity,
  amendPurchaseOrderSubstitutePart,
  cancelPurchaseOrder,
  closePurchaseOrderShort,
  createPurchaseOrder,
  createPurchaseOrderDraftsFromSelection,
  getPurchaseOrder,
  listLatePurchaseOrders,
  listPartPurchaseOrderLines,
  listPurchaseOrderAmendments,
  listPurchaseOrderDocuments,
  listPurchaseOrderReturns,
  listPurchaseOrders,
  listReturnsAwaitingCredit,
  markPurchaseOrderSent,
  postReceipt,
  postReturnToSupplier,
  savePurchaseOrderDraft,
} from '@pkg/core';
import { renderPurchaseOrderPdf } from '@pkg/pdf';
import {
  LatePurchaseOrderResult,
  PartPurchaseOrderLineInput,
  PartPurchaseOrderLineResult,
  PostReceiptInput,
  PostReturnToSupplierInput,
  type PurchaseOrder,
  PurchaseOrderActionInput,
  PurchaseOrderAmendAddLineInput,
  PurchaseOrderAmendExpectedDateInput,
  PurchaseOrderAmendmentListResult,
  PurchaseOrderAmendQuantityInput,
  PurchaseOrderAmendSubstitutePartInput,
  PurchaseOrderCollectionInput,
  PurchaseOrderCreateInput,
  PurchaseOrderDocumentListResult,
  PurchaseOrderLineViewCostFields,
  PurchaseOrderListInput,
  PurchaseOrderListViewResult,
  PurchaseOrderReturnListResult,
  PurchaseOrderReturnRowCostFields,
  PurchaseOrderSaveDraftInput,
  PurchaseOrderSelectionInput,
  PurchaseOrderSelectionResult,
  PurchaseOrderView,
  ReturnAwaitingCreditRowCostFields,
  ReturnsAwaitingCreditResult,
  StockMovementPostResult,
} from '@pkg/schema';

import { mapCoreErrors } from '../../trpc/errors.js';
import { authorizedProcedure, type InventoryCostAccess, projectInventoryCostFields, router } from '../../trpc/init.js';
import { assertedActorErrorFamily, stockMovementErrorFamily } from '../inventory/inventory-error-families.js';
import { assertCanWriteInventoryCost, projectMovement } from '../inventory/stock-movement-transport.js';
import { purchaseOrderErrorFamily, purchaseOrderJobErrorFamily } from './purchase-order-error-families.js';

export const purchaseOrdersRouter = router({
  /**
   * Sent-order changes are gated on `purchase_order:amend`: the right to change what a Supplier is
   * already holding, which is deliberately narrower than the right to raise a draft.
   */
  amendQuantity: authorizedProcedure('purchase_order:amend')
    .input(PurchaseOrderAmendQuantityInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        amendPurchaseOrderQuantity({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
          pdfRenderer: renderPurchaseOrderPdf,
          storage: ctx.storage,
        }),
      );

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),

  amendAddLine: authorizedProcedure('purchase_order:amend')
    .input(PurchaseOrderAmendAddLineInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        amendPurchaseOrderAddLine({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
          pdfRenderer: renderPurchaseOrderPdf,
          storage: ctx.storage,
        }),
      );

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),

  amendExpectedDate: authorizedProcedure('purchase_order:amend')
    .input(PurchaseOrderAmendExpectedDateInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        amendPurchaseOrderExpectedDate({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
          pdfRenderer: renderPurchaseOrderPdf,
          storage: ctx.storage,
        }),
      );

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),

  amendSubstitutePart: authorizedProcedure('purchase_order:amend')
    .input(PurchaseOrderAmendSubstitutePartInput)
    .output(PurchaseOrderView)
    .mutation(async ({ ctx, input }) => {
      const purchaseOrder = await mapPurchaseOrderErrors(() =>
        amendPurchaseOrderSubstitutePart({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
          pdfRenderer: renderPurchaseOrderPdf,
          storage: ctx.storage,
        }),
      );

      return toPurchaseOrderView(purchaseOrder, ctx.access);
    }),

  /** The amendment log carries no prices, so anyone who may read the order may read its history. */
  amendments: authorizedProcedure('purchase_order:read')
    .input(PurchaseOrderCollectionInput)
    .output(PurchaseOrderAmendmentListResult)
    .query(({ ctx, input }) =>
      mapPurchaseOrderErrors(() => listPurchaseOrderAmendments({ db: ctx.db, purchaseOrderId: input.purchaseOrderId })),
    ),

  /** The order's document collection: its PDF revisions and the credit notes filed against it. */
  documents: authorizedProcedure('purchase_order:read')
    .input(PurchaseOrderCollectionInput)
    .output(PurchaseOrderDocumentListResult)
    .query(({ ctx, input }) =>
      mapPurchaseOrderErrors(() => listPurchaseOrderDocuments({ db: ctx.db, purchaseOrderId: input.purchaseOrderId })),
    ),

  /**
   * Stores can post the physical movement, while a Purchase Order amender can complete the same
   * PO-bound return-to-credit workflow without gaining general Checkout or Return to Store rights.
   */
  returnToSupplier: authorizedProcedure(['inventory:move', 'purchase_order:amend'])
    .input(PostReturnToSupplierInput)
    .output(StockMovementPostResult)
    .mutation(async ({ ctx, input }) => {
      const result = await mapReceiptErrors(() =>
        postReturnToSupplier({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      );

      return { ...result, movement: projectMovement(result.movement, ctx.access) };
    }),

  /**
   * The sent order lines carrying one Part — what the stores tablet needs after a scan to receive
   * against the right line, or to send something back off it. Quantity-only, so nothing here needs
   * the cost projection the priced Purchase Order views go through.
   */
  partLines: authorizedProcedure('purchase_order:read')
    .input(PartPurchaseOrderLineInput)
    .output(PartPurchaseOrderLineResult)
    .query(({ ctx, input }) => listPartPurchaseOrderLines({ db: ctx.db, partId: input.partId })),

  returns: authorizedProcedure('purchase_order:read')
    .input(PurchaseOrderCollectionInput)
    .output(PurchaseOrderReturnListResult)
    .query(async ({ ctx, input }) => {
      const result = await mapPurchaseOrderErrors(() =>
        listPurchaseOrderReturns({ db: ctx.db, purchaseOrderId: input.purchaseOrderId }),
      );

      return {
        items: result.items.map((row) =>
          projectInventoryCostFields({ access: ctx.access, costFields: PurchaseOrderReturnRowCostFields, output: row }),
        ),
      };
    }),

  /** Procurement's chase list: what has gone back to Suppliers with no credit note against it yet. */
  returnsAwaitingCredit: authorizedProcedure('purchase_order:read')
    .output(ReturnsAwaitingCreditResult)
    .query(async ({ ctx }) => {
      const result = await listReturnsAwaitingCredit({ db: ctx.db });

      return {
        items: result.items.map((row) =>
          projectInventoryCostFields({
            access: ctx.access,
            costFields: ReturnAwaitingCreditRowCostFields,
            output: row,
          }),
        ),
      };
    }),

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

  /**
   * Orders the shop is still waiting on past the day they were promised (spec §12). Read under
   * `purchase_order:read` rather than `inventory:read`: every row is a Purchase Order, named by its
   * code and its Supplier, and it is the PO screens it sends the reader to.
   */
  late: authorizedProcedure('purchase_order:read')
    .output(LatePurchaseOrderResult)
    .query(({ ctx }) => listLatePurchaseOrders({ db: ctx.db })),

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

  /**
   * A ticked selection becomes one draft per Supplier. Gated on `purchase_order:create` alone: the
   * lines it writes carry no price, so seeding needs no cost access even though editing the drafts
   * afterwards does.
   */
  createFromSelection: authorizedProcedure('purchase_order:create')
    .input(PurchaseOrderSelectionInput)
    .output(PurchaseOrderSelectionResult)
    .mutation(({ ctx, input }) =>
      mapPurchaseOrderErrors(() =>
        createPurchaseOrderDraftsFromSelection({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
      ),
    ),

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
 *
 * The actor family *is* here: both dock flows are worked from the shared tablet, which names the
 * person who signed for the delivery.
 */
async function mapReceiptErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, purchaseOrderErrorFamily, stockMovementErrorFamily, assertedActorErrorFamily);
}
