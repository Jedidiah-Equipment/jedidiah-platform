import {
  createProduct,
  DuplicateProductModelCodeError,
  DuplicateProductNameError,
  DuplicateProductOptionCodeError,
  getProduct,
  listProducts,
  ProductNotFoundError,
  ProductOptionNotFoundError,
  updateProduct,
} from '@pkg/core';
import { ProductCreateInput, ProductListInput, ProductUpdateInput, UUID } from '@pkg/schema';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { log } from '@/logger.js';

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

    if (error instanceof DuplicateProductOptionCodeError) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'A product option with this code already exists for this product.',
      });
    }

    if (error instanceof ProductOptionNotFoundError) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Product option not found.',
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
