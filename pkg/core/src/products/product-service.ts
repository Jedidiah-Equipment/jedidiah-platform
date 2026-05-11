import type { Database } from "@pkg/db";
import { products } from "@pkg/db/schema";
import {
  type Product,
  type ProductCreateInput,
  ProductCreateInputSchema,
  type ProductListInput,
  ProductListInputSchema,
  type ProductListResult,
  type ProductUpdateInput,
  ProductUpdateInputSchema,
} from "@pkg/schema";
import { asc, count, desc, eq } from "drizzle-orm";

import { DuplicateProductNameError, ProductNotFoundError } from "./product-errors.js";

export type ProductDatabase = Database;

type ProductRow = typeof products.$inferSelect;

export function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
  };
}

export async function listProducts(
  database: ProductDatabase,
  input: ProductListInput = ProductListInputSchema.parse(undefined),
): Promise<ProductListResult> {
  const listInput = ProductListInputSchema.parse(input);
  const sortColumn = listInput.sortBy === "id" ? products.id : products.name;
  const orderBy = listInput.sortDirection === "desc" ? desc(sortColumn) : asc(sortColumn);
  const offset = (listInput.page - 1) * listInput.pageSize;

  const [rows, totalRows] = await Promise.all([
    database.select().from(products).orderBy(orderBy).limit(listInput.pageSize).offset(offset),
    database.select({ total: count() }).from(products),
  ]);

  const total = totalRows[0]?.total ?? 0;

  return {
    items: rows.map(mapProduct),
    total,
    page: listInput.page,
    pageSize: listInput.pageSize,
    pageCount: Math.max(1, Math.ceil(total / listInput.pageSize)),
    sortBy: listInput.sortBy,
    sortDirection: listInput.sortDirection,
  };
}

export async function createProduct(
  database: ProductDatabase,
  input: ProductCreateInput,
): Promise<Product> {
  const createInput = ProductCreateInputSchema.parse(input);

  try {
    const [row] = await database.insert(products).values(createInput).returning();

    if (!row) {
      throw new Error("Product insert did not return a row");
    }

    return mapProduct(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateProductNameError(createInput.name);
    }

    throw error;
  }
}

export async function updateProduct(
  database: ProductDatabase,
  input: ProductUpdateInput,
): Promise<Product> {
  const updateInput = ProductUpdateInputSchema.parse(input);

  try {
    const [row] = await database
      .update(products)
      .set({ name: updateInput.name })
      .where(eq(products.id, updateInput.id))
      .returning();

    if (!row) {
      throw new ProductNotFoundError(updateInput.id);
    }

    return mapProduct(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateProductNameError(updateInput.name);
    }

    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  return "cause" in error && isUniqueViolation(error.cause);
}
