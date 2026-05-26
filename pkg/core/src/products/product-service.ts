import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type Db,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  products,
} from '@pkg/db';
import type {
  AuthId,
  Logger,
  ProductCreateInput,
  ProductListInput,
  ProductListResult,
  ProductUpdateInput,
  UUID,
} from '@pkg/schema';
import { Product, ProductCurrencyCode } from '@pkg/schema';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { format } from 'sql-formatter';

import { createAuditChanges, insertAuditEvent, productAuditDescriptor } from '../audit/audit-service.js';
import { DuplicateProductModelCodeError, DuplicateProductNameError, ProductNotFoundError } from './product-errors.js';

type ProductRow = typeof products.$inferSelect;

export function mapProduct(row: ProductRow): Product {
  return Product.parse({
    basePrice: row.basePrice,
    createdAt: row.createdAt.toISOString(),
    currencyCode: ProductCurrencyCode.parse(row.currencyCode),
    description: row.description,
    id: row.id,
    leadTimeDays: row.leadTimeDays,
    modelCode: row.modelCode,
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listProducts({
  db,
  input,
  log,
}: {
  db: Db;
  input: ProductListInput;
  log: Logger;
}): Promise<ProductListResult> {
  const sortColumn = getProductSortColumn(input.sortBy);
  const orderBy = getSortOrder(sortColumn, input.sortDirection);
  const where = buildProductListWhere(input);
  const productsQuery = db.query.products.findMany({
    columns: {
      basePrice: true,
      createdAt: true,
      currencyCode: true,
      description: true,
      id: true,
      leadTimeDays: true,
      modelCode: true,
      name: true,
      updatedAt: true,
    },
    where,
    orderBy: [orderBy],
    ...getPaginationQueryOptions(input),
  });
  const productsSql = productsQuery.toSQL();

  log.service.debug(
    {
      params: productsSql.params,
    },
    `list products sql\n${format(productsSql.sql, {
      language: 'postgresql',
    })}`,
  );

  const [rows, total] = await Promise.all([productsQuery, db.$count(products, where)]);

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
    const globalSearchWhere = createGlobalSearchCondition(listInput.search, [
      sql`${products.description}`,
      sql`${products.modelCode}`,
      sql`${products.name}`,
      sql`${products.id}::text`,
    ]);

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  if (listInput.columnFilters.name) {
    conditions.push(createEscapedContainsSearchCondition(sql`${products.name}`, listInput.columnFilters.name));
  }

  if (listInput.columnFilters.modelCode) {
    conditions.push(
      createEscapedContainsSearchCondition(sql`${products.modelCode}`, listInput.columnFilters.modelCode),
    );
  }

  if (listInput.columnFilters.id) {
    conditions.push(createEscapedContainsSearchCondition(sql`${products.id}::text`, listInput.columnFilters.id));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getProduct({ db, id }: { db: Db; id: UUID }): Promise<Product> {
  const row = await db.query.products.findFirst({
    where: eq(products.id, id),
  });

  if (!row) {
    throw new ProductNotFoundError(id);
  }

  return mapProduct(row);
}

export async function createProduct({
  db,
  input,
  actorUserId,
}: {
  db: Db;
  input: ProductCreateInput;
  actorUserId: AuthId;
}): Promise<Product> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(products).values(input).returning();

      if (!row) {
        throw new Error('Product insert did not return a row');
      }

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'created',
          actorUserId,
          after: row,
          before: null,
          changes: null,
          entityId: row.id,
          entityType: productAuditDescriptor.entityType,
        },
      });

      return mapProduct(row);
    });
  } catch (error) {
    throw mapProductUniqueViolation(error, input);
  }
}

export async function updateProduct({
  db,
  input,
  actorUserId,
}: {
  db: Db;
  input: ProductUpdateInput;
  actorUserId: AuthId;
}): Promise<Product> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(products).where(eq(products.id, input.id)).for('update');

      if (!before) {
        throw new ProductNotFoundError(input.id);
      }

      const after = {
        ...before,
        basePrice: input.basePrice,
        currencyCode: input.currencyCode,
        description: input.description,
        leadTimeDays: input.leadTimeDays,
        modelCode: input.modelCode,
        name: input.name,
      };
      const productChanges = createAuditChanges(before, after, getProductCatalogAuditFields());
      const changes = productChanges;

      if (!changes) {
        return mapProduct(before);
      }

      const [row] = await tx
        .update(products)
        .set({
          basePrice: input.basePrice,
          currencyCode: input.currencyCode,
          description: input.description,
          leadTimeDays: input.leadTimeDays,
          modelCode: input.modelCode,
          name: input.name,
          updatedAt: new Date(),
        })
        .where(eq(products.id, input.id))
        .returning();

      if (!row) {
        throw new ProductNotFoundError(input.id);
      }

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'updated',
          actorUserId,
          after: row,
          before,
          changes,
          entityId: row.id,
          entityType: productAuditDescriptor.entityType,
        },
      });

      return mapProduct(row);
    });
  } catch (error) {
    throw mapProductUniqueViolation(error, input);
  }
}

function getProductCatalogAuditFields(): Record<string, string> {
  return productAuditDescriptor.fields;
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
