import {
  createProduct,
  DuplicateProductNameError,
  listProducts,
  ProductNotFoundError,
  updateProduct,
} from "@pkg/core";
import { ProductCreateInput, ProductListInput, ProductUpdateInput } from "@pkg/schema";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../../trpc/init.js";

export const productsRouter = router({
  list: protectedProcedure
    .input(ProductListInput)
    .query(({ ctx, input }) => listProducts(ctx.db, input)),

  create: protectedProcedure
    .input(ProductCreateInput)
    .mutation(({ ctx, input }) => mapProductErrors(() => createProduct(ctx.db, input))),

  update: protectedProcedure
    .input(ProductUpdateInput)
    .mutation(({ ctx, input }) => mapProductErrors(() => updateProduct(ctx.db, input))),
});

async function mapProductErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof DuplicateProductNameError) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A product with this name already exists.",
      });
    }

    if (error instanceof ProductNotFoundError) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Product not found.",
      });
    }

    throw error;
  }
}
