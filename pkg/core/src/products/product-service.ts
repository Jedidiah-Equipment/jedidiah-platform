import type { Database } from '@pkg/db';
import { getUniqueViolationConstraint, withPagination } from '@pkg/db/query-utils';
import { products } from '@pkg/db/schema';
import type { Product, ProductCreateInput, ProductListInput, ProductListResult, ProductUpdateInput } from '@pkg/schema';
import { ProductCurrencyCode } from '@pkg/schema';
import { and, asc, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, productAuditDescriptor } from '../audit/audit-service.js';
import { DuplicateProductModelCodeError, DuplicateProductNameError, ProductNotFoundError } from './product-errors.js';

type ProductRow = typeof products.$inferSelect;

export function mapProduct(row: ProductRow): Product {
  return {
    basePrice: row.basePrice,
    createdAt: row.createdAt.toISOString(),
    currencyCode: ProductCurrencyCode.parse(row.currencyCode),
    description: row.description,
    id: row.id,
    modelCode: row.modelCode,
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listProducts(database: Database, input: ProductListInput): Promise<ProductListResult> {
  const sortColumn = getProductSortColumn(input.sortBy);
  const orderBy = input.sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn);
  const where = buildProductListWhere(input);
  const rowsQuery = withPagination(
    database
      .select({
        basePrice: products.basePrice,
        createdAt: products.createdAt,
        currencyCode: products.currencyCode,
        description: products.description,
        id: products.id,
        modelCode: products.modelCode,
        name: products.name,
        updatedAt: products.updatedAt,
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
      ilike(products.description, searchPattern),
      ilike(products.modelCode, searchPattern),
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

  if (listInput.columnFilters.modelCode) {
    conditions.push(ilike(products.modelCode, `%${listInput.columnFilters.modelCode}%`));
  }

  if (listInput.columnFilters.id) {
    conditions.push(sql`${products.id}::text ilike ${`%${listInput.columnFilters.id}%`}`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function createProduct(
  database: Database,
  input: ProductCreateInput,
  actorUserId: string | null,
): Promise<Product> {
  try {
    return await database.transaction(async (tx) => {
      const [row] = await tx.insert(products).values(input).returning();

      if (!row) {
        throw new Error('Product insert did not return a row');
      }

      await insertAuditEvent(tx, {
        action: 'created',
        actorUserId,
        after: row,
        before: null,
        changes: null,
        entityId: row.id,
        entityType: productAuditDescriptor.entityType,
      });

      return mapProduct(row);
    });
  } catch (error) {
    throw mapProductUniqueViolation(error, input);
  }
}

export async function updateProduct(
  database: Database,
  input: ProductUpdateInput,
  actorUserId: string | null,
): Promise<Product> {
  try {
    return await database.transaction(async (tx) => {
      const [before] = await tx.select().from(products).where(eq(products.id, input.id)).for('update');

      if (!before) {
        throw new ProductNotFoundError(input.id);
      }

      const after = {
        ...before,
        basePrice: input.basePrice,
        currencyCode: input.currencyCode,
        description: input.description,
        modelCode: input.modelCode,
        name: input.name,
      };
      const changes = createAuditChanges(before, after, productAuditDescriptor.fields);

      if (!changes) {
        return mapProduct(before);
      }

      const [row] = await tx
        .update(products)
        .set({
          basePrice: input.basePrice,
          currencyCode: input.currencyCode,
          description: input.description,
          modelCode: input.modelCode,
          name: input.name,
          updatedAt: new Date(),
        })
        .where(eq(products.id, input.id))
        .returning();

      if (!row) {
        throw new ProductNotFoundError(input.id);
      }

      await insertAuditEvent(tx, {
        action: 'updated',
        actorUserId,
        after: row,
        before,
        changes,
        entityId: row.id,
        entityType: productAuditDescriptor.entityType,
      });

      return mapProduct(row);
    });
  } catch (error) {
    throw mapProductUniqueViolation(error, input);
  }
}

function getProductSortColumn(sortBy: ProductListInput['sortBy']) {
  if (sortBy === 'basePrice') {
    return products.basePrice;
  }

  if (sortBy === 'createdAt') {
    return products.createdAt;
  }

  if (sortBy === 'id') {
    return products.id;
  }

  if (sortBy === 'modelCode') {
    return products.modelCode;
  }

  return products.name;
}

function mapProductUniqueViolation(error: unknown, input: Pick<ProductCreateInput, 'modelCode' | 'name'>): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint?.includes('products_model_code_unique') || constraint?.includes('model_code')) {
    return new DuplicateProductModelCodeError(input.modelCode);
  }

  if (constraint !== null) {
    return new DuplicateProductNameError(input.name);
  }

  return error instanceof Error ? error : new Error(String(error));
}
