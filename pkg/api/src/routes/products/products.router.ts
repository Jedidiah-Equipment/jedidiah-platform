import {
  createProduct,
  DuplicateProductModelCodeError,
  DuplicateProductNameError,
  listProducts,
  ProductNotFoundError,
  updateProduct,
} from '@pkg/core';
import { ProductCreateInput, ProductListInput, ProductUpdateInput } from '@pkg/schema';
import { TRPCError } from '@trpc/server';

import { authorizedProcedure, router } from '../../trpc/init.js';

export const productsRouter = router({
  list: authorizedProcedure('product:read')
    .input(ProductListInput)
    .query(({ ctx, input }) => listProducts(ctx.db, input)),

  create: authorizedProcedure('product:create')
    .input(ProductCreateInput)
    .mutation(({ ctx, input }) => mapProductErrors(() => createProduct(ctx.db, input, ctx.session.user.id))),

  update: authorizedProcedure('product:update')
    .input(ProductUpdateInput)
    .mutation(({ ctx, input }) => mapProductErrors(() => updateProduct(ctx.db, input, ctx.session.user.id))),
});

async function mapProductErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof DuplicateProductNameError) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'A product with this name already exists.',
      });
    }

    if (error instanceof DuplicateProductModelCodeError) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'A product with this model code already exists.',
      });
    }

    if (error instanceof ProductNotFoundError) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Product not found.',
      });
    }

    throw error;
  }
}
