import {
  type CustomerCoreError,
  getProductUnit,
  isCustomerCoreError,
  isProductUnitCoreError,
  isProductUnitReassignError,
  isQuoteCoreError,
  listOnHandProductUnitStock,
  listProductUnitFilterOptions,
  listProductUnits,
  listReassignCandidates,
  type ProductUnitCoreError,
  type ProductUnitReassignError,
  previewReassignment,
  type QuoteCoreError,
  reassignProductUnitToQuote,
  removeProductUnit,
  transferProductUnitOwnership,
  updateProductUnit,
} from '@pkg/core';
import {
  ProductUnitListInput,
  ProductUnitReassignInput,
  ProductUnitStockExportInput,
  ProductUnitTransferInput,
  ProductUnitUpdateInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, fullyAuthorizedProcedure, router } from '../../../trpc/init.js';

export const productUnitsRouter = router({
  list: authorizedProcedure('equipment_product_unit:read')
    .input(ProductUnitListInput)
    .query(({ ctx, input }) => listProductUnits({ db: ctx.db, input })),

  filterOptions: authorizedProcedure('equipment_product_unit:read').query(({ ctx }) =>
    listProductUnitFilterOptions({ db: ctx.db }),
  ),

  /**
   * One row of this report crosses four gates at once — the ledger's cost, the Unit, the Product's
   * base price and the sourcing Quote's Customer and Invoice Number — so it demands all four rather
   * than any of them. An any-of gate would hand Sales, which reads Units and Quotes but no costs, a
   * spreadsheet of what the yard cost us. Gated whole rather than field by field, like
   * `jobs.salesExport`: a caller who cannot read cost would be downloading a valuation with its point
   * cut out of it.
   */
  stockExport: fullyAuthorizedProcedure([
    'equipment_inventory_cost:read',
    'equipment_product:read',
    'equipment_product_unit:read',
    'equipment_quote:read',
  ])
    .input(ProductUnitStockExportInput)
    .query(({ ctx, input }) => listOnHandProductUnitStock({ db: ctx.db, input })),

  get: authorizedProcedure('equipment_product_unit:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapProductUnitErrors(() => getProductUnit({ db: ctx.db, id: input.id }))),

  update: authorizedProcedure('equipment_product_unit:update')
    .input(ProductUnitUpdateInput)
    .mutation(({ ctx, input }) =>
      mapProductUnitErrors(() => updateProductUnit({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  transfer: authorizedProcedure('equipment_product_unit:transfer')
    .input(ProductUnitTransferInput)
    .mutation(({ ctx, input }) =>
      mapTransferErrors(() => transferProductUnitOwnership({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  /**
   * The receiving deal is the subject of all three, so they are gated on the reassignment permission
   * alone: an operator who may move a machine onto a Quote may read what is movable onto it.
   */
  reassignCandidates: authorizedProcedure('equipment_product_unit:reassign')
    .input(z.object({ quoteId: UUID }))
    .query(({ ctx, input }) => mapReassignErrors(() => listReassignCandidates({ db: ctx.db, quoteId: input.quoteId }))),

  reassignPreview: authorizedProcedure('equipment_product_unit:reassign')
    .input(z.object({ productUnitId: UUID, quoteId: UUID }))
    .query(({ ctx, input }) =>
      mapReassignErrors(() =>
        previewReassignment({ db: ctx.db, productUnitId: input.productUnitId, quoteId: input.quoteId }),
      ),
    ),

  reassign: authorizedProcedure('equipment_product_unit:reassign')
    .input(ProductUnitReassignInput)
    .mutation(({ ctx, input }) =>
      mapReassignErrors(() => reassignProductUnitToQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  remove: authorizedProcedure('equipment_product_unit:remove')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) =>
      mapProductUnitErrors(() => removeProductUnit({ actorUserId: ctx.session.user.id, db: ctx.db, id: input.id })),
    ),
});

async function mapProductUnitErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isProductUnitCoreError, mapProductUnitCoreError);
}

/**
 * Reassignment crosses three records, so all three families can refuse it: the Unit, the Quote it is
 * moving to, and the reassignment rules that only exist between them.
 */
async function mapReassignErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapProductUnitErrors(() =>
    mapKnownCoreError(
      () => mapKnownCoreError(action, isProductUnitReassignError, mapProductUnitReassignError),
      isQuoteCoreError,
      mapReassignQuoteCoreError,
    ),
  );
}

function mapProductUnitReassignError(
  error: ProductUnitReassignError,
): CoreErrorMapping<ProductUnitReassignError['code']> {
  return {
    appCode: error.code,
    code: 'CONFLICT',
    message: error.message,
  };
}

function mapReassignQuoteCoreError(error: QuoteCoreError): CoreErrorMapping<QuoteCoreError['code']> {
  return {
    appCode: error.code,
    code: error.code === 'quote.not_found' ? 'NOT_FOUND' : 'BAD_REQUEST',
    message: error.message,
  };
}

// A transfer names its destination Customer, so a Customer invariant can surface here too.
async function mapTransferErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapProductUnitErrors(() => mapKnownCoreError(action, isCustomerCoreError, mapTransferCustomerCoreError));
}

function mapTransferCustomerCoreError(error: CustomerCoreError): CoreErrorMapping<CustomerCoreError['code']> {
  return {
    appCode: error.code,
    code: 'NOT_FOUND',
    message: 'Customer not found.',
  };
}

function mapProductUnitCoreError(error: ProductUnitCoreError): CoreErrorMapping<ProductUnitCoreError['code']> {
  if (error.code === 'product_unit.not_found') {
    return {
      appCode: error.code,
      code: 'NOT_FOUND',
      message: 'Product unit not found.',
    };
  }

  // Removal refused because the machine is still real: the message names which claim holds it.
  if (error.code === 'product_unit.in_use') {
    return {
      appCode: error.code,
      code: 'CONFLICT',
      message: error.message,
    };
  }

  return {
    appCode: error.code,
    code: 'BAD_REQUEST',
    message: error.message,
  };
}
