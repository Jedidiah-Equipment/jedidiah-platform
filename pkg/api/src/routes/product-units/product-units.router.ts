import {
  type CustomerCoreError,
  getProductUnit,
  isCustomerCoreError,
  isProductUnitCoreError,
  listOnHandProductUnitStock,
  listProductUnitFilterOptions,
  listProductUnits,
  type ProductUnitCoreError,
  transferProductUnitOwnership,
  updateProductUnit,
} from '@pkg/core';
import {
  ProductUnitListInput,
  ProductUnitStockExportInput,
  ProductUnitTransferInput,
  ProductUnitUpdateInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, fullyAuthorizedProcedure, router } from '../../trpc/init.js';

export const productUnitsRouter = router({
  list: authorizedProcedure('product_unit:read')
    .input(ProductUnitListInput)
    .query(({ ctx, input }) => listProductUnits({ db: ctx.db, input })),

  filterOptions: authorizedProcedure('product_unit:read').query(({ ctx }) =>
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
  stockExport: fullyAuthorizedProcedure(['inventory_cost:read', 'product:read', 'product_unit:read', 'quote:read'])
    .input(ProductUnitStockExportInput)
    .query(({ ctx, input }) => listOnHandProductUnitStock({ db: ctx.db, input })),

  get: authorizedProcedure('product_unit:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapProductUnitErrors(() => getProductUnit({ db: ctx.db, id: input.id }))),

  update: authorizedProcedure('product_unit:update')
    .input(ProductUnitUpdateInput)
    .mutation(({ ctx, input }) =>
      mapProductUnitErrors(() => updateProductUnit({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  transfer: authorizedProcedure('product_unit:transfer')
    .input(ProductUnitTransferInput)
    .mutation(({ ctx, input }) =>
      mapTransferErrors(() => transferProductUnitOwnership({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),
});

async function mapProductUnitErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isProductUnitCoreError, mapProductUnitCoreError);
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

  return {
    appCode: error.code,
    code: 'BAD_REQUEST',
    message: error.message,
  };
}
