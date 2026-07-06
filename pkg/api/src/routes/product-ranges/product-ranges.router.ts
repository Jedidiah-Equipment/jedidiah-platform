import {
  createProductRange,
  getProductRange,
  isProductRangeCoreError,
  listProductRanges,
  type ProductRangeCoreError,
  removeProductRange,
  reorderProductRanges,
  updateProductRange,
} from '@pkg/core';
import { ProductRangeCreateInput, ProductRangeReorderInput, ProductRangeUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const productRangesRouter = router({
  list: authorizedProcedure('product_range:read').query(({ ctx }) => listProductRanges({ db: ctx.db })),

  get: authorizedProcedure('product_range:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapProductRangeErrors(() => getProductRange({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('product_range:create')
    .input(ProductRangeCreateInput)
    .mutation(({ ctx, input }) => mapProductRangeErrors(() => createProductRange({ db: ctx.db, input }))),

  update: authorizedProcedure('product_range:update')
    .input(ProductRangeUpdateInput)
    .mutation(({ ctx, input }) => mapProductRangeErrors(() => updateProductRange({ db: ctx.db, input }))),

  remove: authorizedProcedure('product_range:update')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) => mapProductRangeErrors(() => removeProductRange({ db: ctx.db, id: input.id }))),

  reorder: authorizedProcedure('product_range:update')
    .input(ProductRangeReorderInput)
    .mutation(({ ctx, input }) => mapProductRangeErrors(() => reorderProductRanges({ db: ctx.db, input }))),
});

async function mapProductRangeErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isProductRangeCoreError, mapProductRangeCoreError);
}

function mapProductRangeCoreError(error: ProductRangeCoreError): CoreErrorMapping<ProductRangeCoreError['code']> {
  return productRangeErrorMappings[error.code];
}

const productRangeErrorMappings = {
  'product_range.duplicate_name': {
    appCode: 'product_range.duplicate_name',
    code: 'CONFLICT',
    message: 'A Product Range with this name already exists.',
  },
  'product_range.not_found': {
    appCode: 'product_range.not_found',
    code: 'NOT_FOUND',
    message: 'Product Range not found.',
  },
  'product_range.has_products': {
    appCode: 'product_range.has_products',
    code: 'CONFLICT',
    message: 'Product Range has active linked products and cannot be removed.',
  },
} satisfies {
  [TCode in ProductRangeCoreError['code']]: CoreErrorMapping<TCode>;
};
