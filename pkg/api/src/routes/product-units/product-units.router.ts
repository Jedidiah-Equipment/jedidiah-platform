import {
  getProductUnit,
  isProductUnitCoreError,
  listProductUnitFilterOptions,
  listProductUnits,
  type ProductUnitCoreError,
} from '@pkg/core';
import { ProductUnitListInput, UUID } from '@pkg/schema';
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
});

async function mapProductUnitErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isProductUnitCoreError, mapProductUnitCoreError);
}

function mapProductUnitCoreError(_error: ProductUnitCoreError): CoreErrorMapping<ProductUnitCoreError['code']> {
  return {
    appCode: 'product_unit.not_found',
    code: 'NOT_FOUND',
    message: 'Product unit not found.',
  };
}
