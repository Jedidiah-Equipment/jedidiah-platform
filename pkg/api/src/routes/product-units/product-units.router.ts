import {
  type CustomerCoreError,
  getProductUnit,
  isCustomerCoreError,
  isProductUnitCoreError,
  listProductUnitFilterOptions,
  listProductUnits,
  type ProductUnitCoreError,
  removeProductUnit,
  transferProductUnitOwnership,
  updateProductUnit,
} from '@pkg/core';
import { ProductUnitListInput, ProductUnitTransferInput, ProductUnitUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const productUnitsRouter = router({
  list: authorizedProcedure('product_unit:read')
    .input(ProductUnitListInput)
    .query(({ ctx, input }) => listProductUnits({ db: ctx.db, input })),

  filterOptions: authorizedProcedure('product_unit:read').query(({ ctx }) =>
    listProductUnitFilterOptions({ db: ctx.db }),
  ),

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

  remove: authorizedProcedure('product_unit:remove')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) =>
      mapProductUnitErrors(() => removeProductUnit({ actorUserId: ctx.session.user.id, db: ctx.db, id: input.id })),
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
