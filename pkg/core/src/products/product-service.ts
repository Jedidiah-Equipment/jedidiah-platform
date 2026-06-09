import { randomUUID } from 'node:crypto';

import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type DatabaseTransaction,
  type Db,
  documents,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  jobBays,
  productBays,
  products,
  user,
} from '@pkg/db';
import { JOB_DEPARTMENT_PIPELINE, validateDocumentMetadata } from '@pkg/domain';
import type {
  Assembly,
  AuthId,
  Logger,
  ProductBay,
  ProductBayInput,
  ProductCreateInput,
  ProductDocument,
  ProductListInput,
  ProductListResult,
  ProductUpdateInput,
  UUID,
} from '@pkg/schema';
import {
  Product,
  ProductBay as ProductBaySchema,
  ProductCurrencyCode,
  ProductDocumentMetadata,
  ProductDocument as ProductDocumentSchema,
} from '@pkg/schema';
import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { format } from 'sql-formatter';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import {
  DocumentNotFoundError,
  DocumentPolicyViolationError,
  DuplicateDocumentFilenameError,
} from '../documents/document-errors.js';
import {
  collectDocumentErrorText,
  createDocumentRecord,
  type DocumentSummaryRow,
  deleteDocumentRecord,
  documentBaseSelect,
  mapDocumentSummary,
  type ReadDocumentResult,
  sanitizeDocumentStorageKeySuffix,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import {
  type AssemblyListRow,
  listAssemblies,
  mapAssembly,
  productAssemblyOrderBy,
  syncAssemblies,
} from './product-assembly-service.js';
import {
  DuplicateProductBayError,
  DuplicateProductModelCodeError,
  DuplicateProductNameError,
  ProductBayDisabledError,
  ProductBayNotFoundError,
  ProductNotFoundError,
} from './product-errors.js';

const PRODUCT_DOCUMENT_FILENAME_UNIQUE_INDEX = 'documents_product_id_filename_ci_unique';

type ProductRow = typeof products.$inferSelect;
type ProductListRow = ProductRow & { assemblies: AssemblyListRow[] };
type ProductAuditInput = ProductRow & {
  assemblies: Assembly[] | NonNullable<ProductUpdateInput['assemblies']>;
  productBays: ProductBay[] | ProductBayInput[];
};
type ProductBayFlatRow = typeof productBays.$inferSelect & {
  bayCreatedAt: Date;
  bayDepartment: typeof jobBays.$inferSelect.department;
  bayDisabledAt: Date | null;
  bayId: string;
  bayName: string;
  bayScheduleOrigin: Date;
  bayUpdatedAt: Date;
};

// Child collections are folded into stable JSON fields so Product aggregate updates audit as a unit
// instead of introducing separate audit entity types for Product Assemblies or Product Bays.
export const productAuditDescriptor = defineAuditDescriptor<ProductAuditInput>({
  entityType: 'product',
  noun: 'product',
  primaryLabelField: 'name',
  entityId: (input) => input.id,
  toRecord: (input) => ({
    assemblies: JSON.stringify(toAuditAssemblies(input.assemblies)),
    basePrice: input.basePrice,
    currencyCode: input.currencyCode,
    description: input.description,
    buildTimeDays: input.buildTimeDays,
    modelCode: input.modelCode,
    name: input.name,
    productBays: JSON.stringify(toAuditProductBays(input.productBays)),
    requiresVinNumber: input.requiresVinNumber,
    thumbnailDataUrl: input.thumbnailDataUrl,
  }),
});
export type ProductDocumentCreateInput = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  metadata: unknown;
  productId: UUID;
};

export function mapProduct(row: ProductRow & { assemblies?: Assembly[]; productBays?: ProductBay[] }): Product {
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
    productBays: row.productBays ?? [],
    requiresVinNumber: row.requiresVinNumber,
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
      requiresVinNumber: true,
      thumbnailDataUrl: true,
      updatedAt: true,
    },
    where,
    orderBy: [orderBy],
    ...getPaginationQueryOptions(input),
    with: {
      assemblies: {
        orderBy: productAssemblyOrderBy,
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
  const productBaysByProductId = await listProductBaysByProductIds({
    db,
    productIds: rows.map((row) => row.id),
  });

  return {
    items: rows.map((row) => mapProductListRow(row, productBaysByProductId.get(row.id) ?? [])),
    total,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

function mapProductListRow(row: ProductListRow, productBaysForRow: ProductBay[] = []): Product {
  return mapProduct({
    ...row,
    assemblies: row.assemblies.map(mapAssembly),
    productBays: productBaysForRow,
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
        orderBy: productAssemblyOrderBy,
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

  return mapProductListRow(row, await listProductBays({ db, productId: row.id }));
}

export async function getProductDocuments({ db, productId }: { db: Db; productId: UUID }): Promise<ProductDocument[]> {
  await assertProductExists({ db, productId });

  const rows = await selectProductDocumentSummary(db)
    .where(eq(documents.productId, productId))
    .orderBy(asc(documents.filename));

  return rows.map(mapProductDocumentSummary);
}

export async function getProductBrochure({
  db,
  productId,
}: {
  db: Db;
  productId: UUID;
}): Promise<ProductDocument | null> {
  await assertProductExists({ db, productId });
  const row = await getProductBrochureSummaryRow({ db, productId });

  return row ? mapProductDocumentSummary(row) : null;
}

export async function createProductDocument({
  actorUserId,
  db,
  input,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: ProductDocumentCreateInput;
  storage: StorageAdapter;
}): Promise<ProductDocument> {
  await assertProductExists({ db, productId: input.productId });
  const metadata = parseProductDocumentMetadata(input.metadata);
  const row = await createDocumentRecord({
    actorUserId,
    db,
    input: {
      bytes: input.bytes,
      filename: input.filename,
      metadata,
      ownerType: 'product',
      productId: input.productId,
      storageKey: createProductDocumentStorageKey({
        filename: input.filename,
        productId: input.productId,
      }),
    },
    mapInsertError: (error) =>
      mapProductDocumentUniqueViolation(error, {
        filename: input.filename,
        productId: input.productId,
      }),
    storage,
  });

  return getProductDocumentSummary({ db, documentId: row.id, productId: input.productId });
}

function parseProductDocumentMetadata(metadata: unknown): ProductDocumentMetadata {
  const result = validateDocumentMetadata({ metadata, ownerType: 'product' });

  if (!result.ok) {
    throw new DocumentPolicyViolationError(result);
  }

  return ProductDocumentMetadata.parse(metadata);
}

export async function readProductDocument({
  db,
  documentId,
  productId,
  storage,
}: {
  db: Db;
  documentId: UUID;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  await assertProductExists({ db, productId });
  const document = await getProductDocumentSummaryRow({ db, documentId, productId });

  return {
    document: mapDocumentSummary(document),
    object: await storage.get(document.storageKey),
  };
}

export async function readProductBrochure({
  db,
  documentId,
  productId,
  storage,
}: {
  db: Db;
  documentId: UUID;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  await assertProductExists({ db, productId });
  const document = await getProductBrochureSummaryRow({ db, documentId, productId });

  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }

  return {
    document: mapProductDocumentSummary(document),
    object: await storage.get(document.storageKey),
  };
}

export async function deleteProductDocument({
  actorUserId,
  db,
  documentId,
  productId,
}: {
  actorUserId: AuthId;
  db: Db;
  documentId: UUID;
  productId: UUID;
}): Promise<void> {
  await assertProductExists({ db, productId });
  const document = await getProductDocumentSummaryRow({ db, documentId, productId });

  await deleteDocumentRecord({ actorUserId, db, document });
}

function selectProductDocumentSummary(db: Db) {
  return db
    .select({
      ...documentBaseSelect,
      uploaderEmail: user.email,
      uploaderName: user.name,
    })
    .from(documents)
    .leftJoin(user, eq(documents.uploaderUserId, user.id))
    .$dynamic();
}

function mapProductDocumentSummary(row: DocumentSummaryRow): ProductDocument {
  return ProductDocumentSchema.parse(mapDocumentSummary(row));
}

async function getProductDocumentSummary({
  db,
  documentId,
  productId,
}: {
  db: Db;
  documentId: UUID;
  productId: UUID;
}): Promise<ProductDocument> {
  return mapProductDocumentSummary(await getProductDocumentSummaryRow({ db, documentId, productId }));
}

async function getProductDocumentSummaryRow({
  db,
  documentId,
  productId,
}: {
  db: Db;
  documentId: UUID;
  productId: UUID;
}): Promise<DocumentSummaryRow> {
  const [row] = await selectProductDocumentSummary(db)
    .where(and(eq(documents.productId, productId), eq(documents.id, documentId)))
    .limit(1);

  if (!row) {
    throw new DocumentNotFoundError(documentId);
  }

  return row;
}

async function getProductBrochureSummaryRow({
  db,
  documentId,
  productId,
}: {
  db: Db;
  documentId?: UUID;
  productId: UUID;
}): Promise<DocumentSummaryRow | null> {
  const filters = [eq(documents.productId, productId), sql`${documents.metadata}->>'type' = 'brochure'`];

  if (documentId) {
    filters.push(eq(documents.id, documentId));
  }

  const [row] = await selectProductDocumentSummary(db)
    .where(and(...filters))
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(1);

  return row ?? null;
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
      const { assemblies: desiredAssemblies, productBays: desiredProductBays, ...productInput } = input;
      const [row] = await tx.insert(products).values(productInput).returning();

      if (!row) {
        throw new Error('Product insert did not return a row');
      }

      const assemblies = await syncAssemblies({
        tx,
        productId: row.id,
        desired: desiredAssemblies,
      });
      const syncedProductBays = await syncProductBays({
        tx,
        productId: row.id,
        desired: desiredProductBays,
      });
      const after = { ...row, assemblies, productBays: syncedProductBays };

      await recordAuditCreate({ db: tx, descriptor: productAuditDescriptor, actorUserId, input: after });

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
      const beforeProductBays = await listProductBays({ db: tx, productId: input.id });
      const desiredAssemblies = input.assemblies ?? beforeAssemblies;
      const desiredProductBays = input.productBays;
      const patch = {
        basePrice: input.basePrice,
        currencyCode: input.currencyCode,
        description: input.description,
        buildTimeDays: input.buildTimeDays,
        modelCode: input.modelCode,
        name: input.name,
        requiresVinNumber: input.requiresVinNumber,
        thumbnailDataUrl: input.thumbnailDataUrl,
      };
      const after = { ...before, ...patch, assemblies: desiredAssemblies, productBays: desiredProductBays };
      const changes = diffAuditUpdate(
        productAuditDescriptor,
        { ...before, assemblies: beforeAssemblies, productBays: beforeProductBays },
        after,
      );

      if (!changes) {
        return mapProduct({ ...before, assemblies: beforeAssemblies, productBays: beforeProductBays });
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
      const syncedProductBays = await syncProductBays({
        tx,
        productId: row.id,
        desired: desiredProductBays,
      });
      const afterWithChildren = { ...row, assemblies, productBays: syncedProductBays };

      await recordAuditUpdate({
        db: tx,
        descriptor: productAuditDescriptor,
        actorUserId,
        after: afterWithChildren,
        changes,
      });

      return mapProduct(afterWithChildren);
    });
  } catch (error) {
    throw mapProductUniqueViolation(error, input);
  }
}

async function syncProductBays({
  tx,
  productId,
  desired,
}: {
  tx: DatabaseTransaction;
  productId: UUID;
  desired: ProductBayInput[];
}): Promise<ProductBay[]> {
  assertUniqueProductBayIds(desired);

  const currentRows = await tx.select().from(productBays).where(eq(productBays.productId, productId));
  const currentBayIds = new Set(currentRows.map((row) => row.bayId));

  await assertValidProductBayTargets({ tx, currentBayIds, desired });
  await tx.delete(productBays).where(eq(productBays.productId, productId));

  if (desired.length > 0) {
    await tx.insert(productBays).values(
      desired.map((productBay) => ({
        bayId: productBay.bayId,
        defaultWorkingDays: productBay.defaultWorkingDays,
        productId,
      })),
    );
  }

  return listProductBays({ db: tx, productId });
}

async function listProductBays({
  db,
  productId,
}: {
  db: Db | DatabaseTransaction;
  productId: UUID;
}): Promise<ProductBay[]> {
  return (await selectProductBays(db).where(eq(productBays.productId, productId))).map(mapProductBayRow);
}

async function listProductBaysByProductIds({
  db,
  productIds,
}: {
  db: Db;
  productIds: UUID[];
}): Promise<Map<UUID, ProductBay[]>> {
  const productBaysByProductId = new Map<UUID, ProductBay[]>();

  if (productIds.length === 0) {
    return productBaysByProductId;
  }

  for (const productBay of (await selectProductBays(db).where(inArray(productBays.productId, productIds))).map(
    mapProductBayRow,
  )) {
    const productBaysForProduct = productBaysByProductId.get(productBay.productId) ?? [];
    productBaysForProduct.push(productBay);
    productBaysByProductId.set(productBay.productId, productBaysForProduct);
  }

  return productBaysByProductId;
}

function selectProductBays(db: Db | DatabaseTransaction) {
  return db
    .select({
      bayCreatedAt: jobBays.createdAt,
      bayDepartment: jobBays.department,
      bayDisabledAt: jobBays.disabledAt,
      bayId: productBays.bayId,
      bayName: jobBays.name,
      bayScheduleOrigin: jobBays.scheduleOrigin,
      bayUpdatedAt: jobBays.updatedAt,
      createdAt: productBays.createdAt,
      defaultWorkingDays: productBays.defaultWorkingDays,
      productId: productBays.productId,
      updatedAt: productBays.updatedAt,
    })
    .from(productBays)
    .innerJoin(jobBays, eq(productBays.bayId, jobBays.id))
    .orderBy(
      sql`case ${jobBays.department}
        ${sql.join(
          JOB_DEPARTMENT_PIPELINE.map((step, index) => sql`when ${step.department} then ${index}`),
          sql` `,
        )}
        else ${JOB_DEPARTMENT_PIPELINE.length}
      end`,
      asc(jobBays.name),
      asc(jobBays.id),
    )
    .$dynamic();
}

function mapProductBayRow(row: ProductBayFlatRow): ProductBay {
  return ProductBaySchema.parse({
    bay: {
      createdAt: row.bayCreatedAt.toISOString(),
      department: row.bayDepartment,
      disabledAt: row.bayDisabledAt?.toISOString() ?? null,
      id: row.bayId,
      name: row.bayName,
      scheduleOrigin: row.bayScheduleOrigin.toISOString(),
      updatedAt: row.bayUpdatedAt.toISOString(),
    },
    bayId: row.bayId,
    defaultWorkingDays: row.defaultWorkingDays,
    productId: row.productId,
  });
}

async function assertValidProductBayTargets({
  tx,
  currentBayIds,
  desired,
}: {
  tx: DatabaseTransaction;
  currentBayIds: Set<UUID>;
  desired: ProductBayInput[];
}): Promise<void> {
  const desiredBayIds = desired.map((productBay) => productBay.bayId);

  if (desiredBayIds.length === 0) {
    return;
  }

  const rows = await tx.select().from(jobBays).where(inArray(jobBays.id, desiredBayIds)).for('update');
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  for (const productBay of desired) {
    const bay = rowsById.get(productBay.bayId);

    if (!bay) {
      throw new ProductBayNotFoundError(productBay.bayId);
    }

    if (bay.disabledAt && !currentBayIds.has(productBay.bayId)) {
      throw new ProductBayDisabledError(productBay.bayId);
    }
  }
}

function assertUniqueProductBayIds(productBaysForProduct: ProductBayInput[]): void {
  const bayIds = new Set<string>();

  for (const productBay of productBaysForProduct) {
    if (bayIds.has(productBay.bayId)) {
      throw new DuplicateProductBayError(productBay.bayId);
    }

    bayIds.add(productBay.bayId);
  }
}

async function assertProductExists({ db, productId }: { db: Db; productId: UUID }): Promise<void> {
  const [product] = await db
    .select({
      id: products.id,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    throw new ProductNotFoundError(productId);
  }
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

function toAuditProductBays(productBaysForProduct: ProductBay[] | ProductBayInput[]): ProductBayInput[] {
  return productBaysForProduct
    .map((productBay) => ({
      bayId: productBay.bayId,
      defaultWorkingDays: productBay.defaultWorkingDays,
    }))
    .toSorted((left, right) => left.bayId.localeCompare(right.bayId));
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

function createProductDocumentStorageKey(input: { filename: string; productId: UUID }): string {
  return `documents/product/${input.productId}/${randomUUID()}-${sanitizeDocumentStorageKeySuffix(input.filename)}`;
}

function mapProductDocumentUniqueViolation(error: unknown, input: { filename: string; productId: UUID }): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint?.includes(PRODUCT_DOCUMENT_FILENAME_UNIQUE_INDEX) || isProductDocumentFilenameUniqueDetail(error)) {
    return new DuplicateDocumentFilenameError({
      filename: input.filename,
      ownerId: input.productId,
      ownerType: 'product',
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isProductDocumentFilenameUniqueDetail(error: unknown): boolean {
  const text = collectDocumentErrorText(error).join('\n');

  return text.includes('documents') && text.includes('product_id') && text.includes('lower(filename)');
}
