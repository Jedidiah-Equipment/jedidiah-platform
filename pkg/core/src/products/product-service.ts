import type { Database } from "@pkg/db";
import { isUniqueViolation, withPagination } from "@pkg/db/query-utils";
import { products } from "@pkg/db/schema";
import type {
  Product,
  ProductCreateInput,
  ProductListInput,
  ProductListResult,
  ProductUpdateInput,
} from "@pkg/schema";
import { and, asc, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";

import { DuplicateProductNameError, ProductNotFoundError } from "./product-errors.js";

type ProductRow = typeof products.$inferSelect;

export function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
  };
}

export async function listProducts(
  database: Database,
  input: ProductListInput,
): Promise<ProductListResult> {
  const sortColumn = input.sortBy === "id" ? products.id : products.name;
  const orderBy = input.sortDirection === "desc" ? desc(sortColumn) : asc(sortColumn);
  const where = buildProductListWhere(input);
  const rowsQuery = withPagination(
    database
      .select({
        id: products.id,
        name: products.name,
      })
      .from(products)
      .where(where)
      .orderBy(orderBy)
      .$dynamic(),
    input,
  );

  const [rows, total] = await Promise.all([rowsQuery, database.$count(products, where)]);

  return {
    items: rows.map(mapProduct),
    total,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

function buildProductListWhere(listInput: ProductListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (listInput.search) {
    const searchPattern = `%${listInput.search}%`;
    const globalSearchWhere = or(
      ilike(products.name, searchPattern),
      sql`${products.id}::text ilike ${searchPattern}`,
    );

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  if (listInput.columnFilters.name) {
    conditions.push(ilike(products.name, `%${listInput.columnFilters.name}%`));
  }

  if (listInput.columnFilters.id) {
    conditions.push(sql`${products.id}::text ilike ${`%${listInput.columnFilters.id}%`}`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function createProduct(
  database: Database,
  input: ProductCreateInput,
): Promise<Product> {
  try {
    const [row] = await database.insert(products).values(input).returning();

    if (!row) {
      throw new Error("Product insert did not return a row");
    }

    return mapProduct(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateProductNameError(input.name);
    }

    throw error;
  }
}

export async function updateProduct(
  database: Database,
  input: ProductUpdateInput,
): Promise<Product> {
  try {
    const [row] = await database
      .update(products)
      .set({ name: input.name })
      .where(eq(products.id, input.id))
      .returning();

    if (!row) {
      throw new ProductNotFoundError(input.id);
    }

    return mapProduct(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateProductNameError(input.name);
    }

    throw error;
  }
}
