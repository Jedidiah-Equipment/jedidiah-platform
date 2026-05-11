import {
  createProduct,
  DuplicateProductNameError,
  listProducts,
  ProductNotFoundError,
  updateProduct,
} from "@pkg/core";
import { db } from "@pkg/db";
import {
  ProductCreateInputSchema,
  ProductListInputSchema,
  ProductUpdateInputSchema,
} from "@pkg/schema";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../../trpc/init.js";

export const productsRouter = router({
  list: protectedProcedure
    .input(ProductListInputSchema)
    .query(({ input }) => listProducts(db, input)),

  create: protectedProcedure
    .input(ProductCreateInputSchema)
    .mutation(({ input }) => mapProductErrors(() => createProduct(db, input))),

  update: protectedProcedure
    .input(ProductUpdateInputSchema)
    .mutation(({ input }) => mapProductErrors(() => updateProduct(db, input))),
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
