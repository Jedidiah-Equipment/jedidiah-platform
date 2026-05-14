import type { Database } from '@pkg/db';
import { getUniqueViolationConstraint, withPagination } from '@pkg/db/query-utils';
import { productOptions, products } from '@pkg/db/schema';
import type { Product, ProductCreateInput, ProductListInput, ProductListResult, ProductUpdateInput } from '@pkg/schema';
import { ProductCurrencyCode } from '@pkg/schema';
import { and, asc, desc, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, productAuditDescriptor } from '../audit/audit-service.js';
import { DuplicateProductModelCodeError, DuplicateProductNameError, ProductNotFoundError } from './product-errors.js';
import { insertProductOptions, mapProductOption, syncProductOptions } from './product-option-service.js';

type ProductRow = typeof products.$inferSelect;
type ProductOptionRow = typeof productOptions.$inferSelect;

export function mapProduct(row: ProductRow, options: ProductOptionRow[] = []): Product {
  return {
    basePrice: row.basePrice,
    createdAt: row.createdAt.toISOString(),
    currencyCode: ProductCurrencyCode.parse(row.currencyCode),
    description: row.description,
    id: row.id,
    modelCode: row.modelCode,
    name: row.name,
    options: options.map(mapProductOption),
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
    items: rows.map((row) => mapProduct(row)),
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

export async function getProduct(database: Database, id: string): Promise<Product> {
  const rows = await database
    .select({
      option: productOptions,
      product: products,
    })
    .from(products)
    .leftJoin(productOptions, and(eq(productOptions.productId, products.id), isNull(productOptions.deletedAt)))
    .where(eq(products.id, id))
    .orderBy(asc(productOptions.code));
  const productRow = rows[0]?.product;

  if (!productRow) {
    throw new ProductNotFoundError(id);
  }

  return mapProduct(
    productRow,
    rows.flatMap((row) => (row.option ? [row.option] : [])),
  );
}

export async function createProduct(
  database: Database,
  input: ProductCreateInput,
  actorUserId: string | null,
): Promise<Product> {
  try {
    return await database.transaction(async (tx) => {
      const { options, ...productInput } = input;
      const [row] = await tx.insert(products).values(productInput).returning();

      if (!row) {
        throw new Error('Product insert did not return a row');
      }

      const optionRows = await insertProductOptions(tx, row.id, options, actorUserId);

      await insertAuditEvent(tx, {
        action: 'created',
        actorUserId,
        after: row,
        before: null,
        changes: null,
        entityId: row.id,
        entityType: productAuditDescriptor.entityType,
      });

      return mapProduct(row, optionRows);
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

      const { options, ...productInput } = input;
      const after = {
        ...before,
        basePrice: productInput.basePrice,
        currencyCode: productInput.currencyCode,
        description: productInput.description,
        modelCode: productInput.modelCode,
        name: productInput.name,
      };
      const changes = createAuditChanges(before, after, productAuditDescriptor.fields);
      const optionRows = await syncProductOptions(tx, input.id, options, actorUserId);

      if (!changes) {
        return mapProduct(before, optionRows);
      }

      const [row] = await tx
        .update(products)
        .set({
          basePrice: productInput.basePrice,
          currencyCode: productInput.currencyCode,
          description: productInput.description,
          modelCode: productInput.modelCode,
          name: productInput.name,
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

      return mapProduct(row, optionRows);
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
