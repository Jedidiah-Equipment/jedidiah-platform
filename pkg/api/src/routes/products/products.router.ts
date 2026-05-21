import {
  createProduct,
  getProduct,
  isProductCoreError,
  listProducts,
  type ProductCoreError,
  updateProduct,
} from '@pkg/core';
import { ProductCreateInput, ProductListInput, ProductUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { log } from '@/logger.js';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const productsRouter = router({
  list: authorizedProcedure('product:read')
    .input(ProductListInput)
    .query(({ ctx, input }) => listProducts({ db: ctx.db, input, log })),

  get: authorizedProcedure('product:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapProductErrors(() => getProduct({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('product:create')
    .input(ProductCreateInput)
    .mutation(({ ctx, input }) =>
      mapProductErrors(() => createProduct({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  update: authorizedProcedure('product:update')
    .input(ProductUpdateInput)
    .mutation(({ ctx, input }) =>
      mapProductErrors(() => updateProduct({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),
});

async function mapProductErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isProductCoreError, mapProductCoreError);
}

function mapProductCoreError(error: ProductCoreError): CoreErrorMapping<ProductCoreError['code']> {
  switch (error.code) {
    case 'product.duplicate_name':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A product with this name already exists.',
      };
    case 'product.duplicate_model_code':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A product with this model code already exists.',
      };
    case 'product.option_duplicate_code':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A product option with this code already exists for this product.',
      };
    case 'product.department_station_mismatch':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Default stations must belong to the matching Department.',
      };
    case 'product.option_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Product option not found.',
      };
    case 'product.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Product not found.',
      };
    default:
      return assertNever(error);
  }
}
