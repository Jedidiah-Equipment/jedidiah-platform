import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type Db,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  productAssemblies,
  products,
} from '@pkg/db';
import type {
  Assembly,
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
import { type AssemblyListRow, listAssemblies, mapAssembly, syncAssemblies } from './product-assembly-service.js';
import { DuplicateProductModelCodeError, DuplicateProductNameError, ProductNotFoundError } from './product-errors.js';

type ProductRow = typeof products.$inferSelect;
type ProductListRow = ProductRow & { assemblies: AssemblyListRow[] };
type ProductCatalogAuditRecord = ProductRow & { assemblies: string };

export function mapProduct(row: ProductRow & { assemblies?: Assembly[] }): Product {
  return Product.parse({
    assemblies: row.assemblies ?? [],
    basePrice: row.basePrice,
    createdAt: row.createdAt.toISOString(),
    currencyCode: ProductCurrencyCode.parse(row.currencyCode),
    description: row.description,
    id: row.id,
    buildTimeDays: row.buildTimeDays,
    modelCode: row.modelCode,
    name: row.name,
    thumbnailDataUrl: row.thumbnailDataUrl,
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
      buildTimeDays: true,
      modelCode: true,
      name: true,
      thumbnailDataUrl: true,
      updatedAt: true,
    },
    where,
    orderBy: [orderBy],
    ...getPaginationQueryOptions(input),
    with: {
      assemblies: {
        orderBy: [
          sql`case when ${productAssemblies.kind} = 'standard' then 0 else 1 end`,
          getSortOrder(productAssemblies.name, 'asc'),
        ],
        with: {
          assemblyParts: {
            with: {
              part: {
                columns: {
                  category: true,
                  code: true,
                },
              },
            },
          },
          optionalOverrides: true,
        },
      },
    },
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
    items: rows.map(mapProductListRow),
    total,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

function mapProductListRow(row: ProductListRow): Product {
  return mapProduct({
    ...row,
    assemblies: row.assemblies.map(mapAssembly),
  });
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
    with: {
      assemblies: {
        orderBy: [
          sql`case when ${productAssemblies.kind} = 'standard' then 0 else 1 end`,
          getSortOrder(productAssemblies.name, 'asc'),
        ],
        with: {
          assemblyParts: {
            with: {
              part: {
                columns: {
                  category: true,
                  code: true,
                },
              },
            },
          },
          optionalOverrides: true,
        },
      },
    },
  });

  if (!row) {
    throw new ProductNotFoundError(id);
  }

  return mapProductListRow(row);
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
      const { assemblies: desiredAssemblies, ...productInput } = input;
      const [row] = await tx.insert(products).values(productInput).returning();

      if (!row) {
        throw new Error('Product insert did not return a row');
      }

      const assemblies = await syncAssemblies({
        tx,
        productId: row.id,
        desired: desiredAssemblies,
      });
      const after = { ...row, assemblies };

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'created',
          actorUserId,
          after: toProductCatalogAuditRecord(after),
          before: null,
          changes: null,
          entityId: row.id,
          entityType: productAuditDescriptor.entityType,
        },
      });

      return mapProduct(after);
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

      const beforeAssemblies = await listAssemblies({ tx, productId: input.id });
      const desiredAssemblies = input.assemblies ?? beforeAssemblies;
      const patch = {
        basePrice: input.basePrice,
        currencyCode: input.currencyCode,
        description: input.description,
        buildTimeDays: input.buildTimeDays,
        modelCode: input.modelCode,
        name: input.name,
        thumbnailDataUrl: input.thumbnailDataUrl,
      };
      const after = { ...before, ...patch, assemblies: desiredAssemblies };
      const changes = createAuditChanges(
        toProductCatalogAuditRecord({ ...before, assemblies: beforeAssemblies }),
        toProductCatalogAuditRecord(after),
        productAuditDescriptor.fields,
      );

      if (!changes) {
        return mapProduct({ ...before, assemblies: beforeAssemblies });
      }

      const [row] = await tx
        .update(products)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(products.id, input.id))
        .returning();

      if (!row) {
        throw new ProductNotFoundError(input.id);
      }

      const assemblies = input.assemblies
        ? await syncAssemblies({
            tx,
            productId: row.id,
            desired: input.assemblies,
          })
        : beforeAssemblies;
      const afterWithAssemblies = { ...row, assemblies };

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'updated',
          actorUserId,
          after: toProductCatalogAuditRecord(afterWithAssemblies),
          before: toProductCatalogAuditRecord({ ...before, assemblies: beforeAssemblies }),
          changes,
          entityId: row.id,
          entityType: productAuditDescriptor.entityType,
        },
      });

      return mapProduct(afterWithAssemblies);
    });
  } catch (error) {
    throw mapProductUniqueViolation(error, input);
  }
}

function toProductCatalogAuditRecord(
  row: ProductRow & { assemblies: Assembly[] | NonNullable<ProductUpdateInput['assemblies']> },
): ProductCatalogAuditRecord {
  return {
    ...row,
    assemblies: JSON.stringify(toAuditAssemblies(row.assemblies)),
  };
}

function toAuditAssemblies(
  assemblies: Assembly[] | NonNullable<ProductUpdateInput['assemblies']>,
): NonNullable<ProductUpdateInput['assemblies']> {
  return assemblies.map((assembly) => {
    const parts = assembly.parts
      .map((part) => ({ partId: part.partId, quantity: part.quantity }))
      .toSorted((left, right) => left.partId.localeCompare(right.partId));

    if (assembly.kind === 'standard') {
      return {
        id: assembly.id,
        kind: 'standard',
        name: assembly.name,
        parts,
      };
    }

    return {
      id: assembly.id,
      kind: 'optional',
      name: assembly.name,
      overrideStandardAssemblyIds: assembly.overrideStandardAssemblyIds.toSorted(),
      parts,
      price: assembly.price,
    };
  });
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
