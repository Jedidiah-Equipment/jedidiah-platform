import { randomUUID } from 'node:crypto';

import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type DatabaseTransaction,
  type Db,
  documents,
  getForeignKeyViolationConstraint,
  getPaginationOffset,
  getPaginationQueryOptions,
  getSortOrder,
  getUniqueViolationConstraint,
  jobBays,
  notRemoved,
  type ProductImageStore,
  productBays,
  productRanges,
  productRangeVariants,
  products,
  type StoredFile,
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
  ProductImageSlot,
  ProductListInput,
  ProductListResult,
  ProductRangeOption,
  ProductRangeVariantOption,
  ProductUpdateInput,
  UUID,
} from '@pkg/schema';
import {
  Product,
  ProductBay as ProductBaySchema,
  ProductCurrencyCode,
  ProductDocumentMetadata,
  ProductDocument as ProductDocumentSchema,
  ProductImages,
  ProductRangeOption as ProductRangeOptionSchema,
  ProductRangeVariantOption as ProductRangeVariantOptionSchema,
} from '@pkg/schema';
import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { format } from 'sql-formatter';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditDelete,
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
  ProductRangeReferenceNotFoundError,
  ProductRangeVariantReferenceNotFoundError,
} from './product-errors.js';

const PRODUCT_DOCUMENT_FILENAME_UNIQUE_INDEX = 'documents_product_id_filename_ci_unique';
const PRODUCT_RANGE_FOREIGN_KEY = 'products_range_id_product_ranges_id_fk';
const PRODUCT_VARIANT_RANGE_FOREIGN_KEY = 'products_variant_range_fk';

type ProductRow = typeof products.$inferSelect & {
  range: ProductRangeOption;
  variant: ProductRangeVariantOption | null;
};
type ProductListRow = ProductRow & { assemblies: AssemblyListRow[] };

// Shared relational read shape for full Product reads — the paged list and the unpaged catalog read. The
// column set is everything {@link mapProduct} needs; the `with` pulls kind-ordered assemblies plus their
// parts and optional overrides so {@link mapAssembly} has its inputs.
const productListColumns = {
  basePrice: true,
  category: true,
  createdAt: true,
  currencyCode: true,
  deletedAt: true,
  description: true,
  displayOrder: true,
  id: true,
  images: true,
  keyFeatures: true,
  technicalDetails: true,
  buildTimeDays: true,
  modelCode: true,
  name: true,
  nameHighlight: true,
  rangeId: true,
  variantId: true,
  requiresVinNumber: true,
  brochureEnabled: true,
  landerEnabled: true,
  thumbnailDataUrl: true,
  translations: true,
  updatedAt: true,
} as const;

const productListWith = {
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
  range: {
    columns: {
      id: true,
      name: true,
    },
  },
  variant: {
    columns: {
      id: true,
      rangeId: true,
      name: true,
    },
  },
} as const;
type ProductAuditInput = typeof products.$inferSelect & {
  assemblies: Assembly[] | NonNullable<ProductUpdateInput['assemblies']>;
  productBays: ProductBay[] | ProductBayInput[];
};
type ProductBayFlatRow = typeof productBays.$inferSelect & {
  bayCreatedAt: Date;
  bayDepartment: typeof jobBays.$inferSelect.department;
  bayDisabledAt: Date | null;
  bayId: string;
  bayName: string;
  bayScheduleOrigin: string;
  bayUpdatedAt: Date;
};

// Child collections audit element-wise (`toCollections`) so a change to one assembly or bay records
// only that element instead of introducing separate audit entity types for Product Assemblies or
// Product Bays — or dumping the whole collection into one field.
export const productAuditDescriptor = defineAuditDescriptor<ProductAuditInput>({
  entityType: 'product',
  noun: 'product',
  primaryLabelField: 'name',
  entityId: (input) => input.id,
  toRecord: (input) => ({
    basePrice: input.basePrice,
    category: input.category,
    currencyCode: input.currencyCode,
    description: input.description,
    displayOrder: input.displayOrder,
    buildTimeDays: input.buildTimeDays,
    modelCode: input.modelCode,
    name: input.name,
    nameHighlight: input.nameHighlight,
    rangeId: input.rangeId,
    variantId: input.variantId,
    requiresVinNumber: input.requiresVinNumber,
    brochureEnabled: input.brochureEnabled,
    landerEnabled: input.landerEnabled,
    thumbnailDataUrl: input.thumbnailDataUrl,
  }),
  toCollections: (input) => ({
    assembly: toAuditAssemblies(input.assemblies).map((assembly) => ({
      // Client-sent assemblies without an id audit as removed + added, matching syncAssemblies'
      // delete-and-recreate semantics.
      key: assembly.id ?? `new:${assembly.name}`,
      label: assembly.name,
      value: assembly,
    })),
    // keyFeatures/technicalDetails are ordered jsonb arrays; `position` keeps reorders diffable for
    // the same reason as assembly displayOrder.
    keyFeature: input.keyFeatures.map((feature, index) => ({
      key: feature,
      label: feature,
      value: { position: index, text: feature },
    })),
    productBay: input.productBays.map((productBay) => ({
      key: productBay.bayId,
      // ProductBayInput carries no bay name; the diff falls back to the persisted side's label, so
      // only a newly added bay labels as its id.
      label: 'bay' in productBay ? productBay.bay.name : undefined,
      value: { bayId: productBay.bayId, defaultWorkingDays: productBay.defaultWorkingDays },
    })),
    technicalDetail: input.technicalDetails.map((detail, index) => ({
      key: detail.label,
      label: detail.label,
      value: { label: detail.label, position: index, value: detail.value },
    })),
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
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    currencyCode: ProductCurrencyCode.parse(row.currencyCode),
    description: row.description,
    displayOrder: row.displayOrder,
    id: row.id,
    images: mapProductImages(row.images),
    keyFeatures: row.keyFeatures,
    technicalDetails: row.technicalDetails,
    buildTimeDays: row.buildTimeDays,
    modelCode: row.modelCode,
    name: row.name,
    nameHighlight: row.nameHighlight,
    productBays: row.productBays ?? [],
    range: row.range,
    rangeId: row.rangeId,
    variant: row.variant,
    variantId: row.variantId,
    requiresVinNumber: row.requiresVinNumber,
    brochureEnabled: row.brochureEnabled,
    landerEnabled: row.landerEnabled,
    thumbnailDataUrl: row.thumbnailDataUrl,
    translations: row.translations,
    updatedAt: row.updatedAt.toISOString(),
  });
}

// Plain per-slot shape fed to the schema, which brands the strings (content type, ISO date) on parse.
type ProductImageInput = { byteSize: number; contentType: string; updatedAt: string } | null;

// Projects the stored per-slot references into the client-facing read model, dropping the internal
// storage key. The `satisfies` pins slot completeness (a new slot is a compile error here, not a silent
// gap), and the single parse brands the values. Tolerates a row that predates the column (undefined) by
// treating every slot as empty.
function mapProductImages(store: ProductImageStore | undefined): ProductImages {
  return ProductImages.parse({
    banner: toProductImageInput(store?.banner),
    primary: toProductImageInput(store?.primary),
    secondary1: toProductImageInput(store?.secondary1),
    secondary2: toProductImageInput(store?.secondary2),
    technicalDrawing: toProductImageInput(store?.technicalDrawing),
  } satisfies Record<ProductImageSlot, ProductImageInput>);
}

function toProductImageInput(ref: StoredFile | undefined): ProductImageInput {
  return ref ? { byteSize: ref.byteSize, contentType: ref.contentType, updatedAt: ref.updatedAt } : null;
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
  const where = buildProductListWhere(input);
  const [rows, total] =
    input.sortBy === 'rangeName'
      ? await listProductsSortedByRangeName({ db, input, where })
      : input.sortBy === 'variantName'
        ? await listProductsSortedByVariantName({ db, input, where })
        : await listProductsSortedByProductColumn({ db, input, log, where });

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

async function listProductsSortedByProductColumn({
  db,
  input,
  log,
  where,
}: {
  db: Db;
  input: ProductListInput;
  log: Logger;
  where: SQL;
}): Promise<[ProductListRow[], number]> {
  const sortColumn = getProductSortColumn(input.sortBy);
  const orderBy = getSortOrder(sortColumn, input.sortDirection);
  const productsQuery = db.query.products.findMany({
    columns: productListColumns,
    where,
    orderBy: [orderBy],
    ...getPaginationQueryOptions(input),
    with: productListWith,
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

  return Promise.all([productsQuery, db.$count(products, where)]);
}

// Range-name sorting needs the Range join for order, while Product mapping still depends on the
// relational read shape above. Page ordered ids first, then hydrate those Products normally.
async function listProductsSortedByRangeName({
  db,
  input,
  where,
}: {
  db: Db;
  input: ProductListInput;
  where: SQL;
}): Promise<[ProductListRow[], number]> {
  let idQuery = db
    .select({ id: products.id })
    .from(products)
    .innerJoin(productRanges, eq(products.rangeId, productRanges.id))
    .where(where)
    .orderBy(getSortOrder(productRanges.name, input.sortDirection), asc(products.name), asc(products.id))
    .$dynamic();

  if (input.pageSize !== 0) {
    idQuery = idQuery.limit(input.pageSize).offset(getPaginationOffset(input));
  }

  const [idRows, total] = await Promise.all([idQuery, db.$count(products, where)]);
  const productIds = idRows.map((row) => row.id);

  if (productIds.length === 0) {
    return [[], total];
  }

  const orderByProductId = new Map(productIds.map((id, index) => [id, index]));
  const rows = await db.query.products.findMany({
    columns: productListColumns,
    where: inArray(products.id, productIds),
    with: productListWith,
  });

  rows.sort((left, right) => (orderByProductId.get(left.id) ?? 0) - (orderByProductId.get(right.id) ?? 0));

  return [rows, total];
}

// Variant sorting mirrors Range-name sorting but keeps a left join so Products with no Variant stay in
// the result set; the null-marker order term keeps those rows last in both ascending and descending order.
async function listProductsSortedByVariantName({
  db,
  input,
  where,
}: {
  db: Db;
  input: ProductListInput;
  where: SQL;
}): Promise<[ProductListRow[], number]> {
  let idQuery = db
    .select({ id: products.id })
    .from(products)
    .leftJoin(productRangeVariants, eq(products.variantId, productRangeVariants.id))
    .where(where)
    .orderBy(
      sql`${productRangeVariants.name} IS NULL`,
      getSortOrder(productRangeVariants.name, input.sortDirection),
      asc(products.name),
      asc(products.id),
    )
    .$dynamic();

  if (input.pageSize !== 0) {
    idQuery = idQuery.limit(input.pageSize).offset(getPaginationOffset(input));
  }

  const [idRows, total] = await Promise.all([idQuery, db.$count(products, where)]);
  const productIds = idRows.map((row) => row.id);

  if (productIds.length === 0) {
    return [[], total];
  }

  const orderByProductId = new Map(productIds.map((id, index) => [id, index]));
  const rows = await db.query.products.findMany({
    columns: productListColumns,
    where: inArray(products.id, productIds),
    with: productListWith,
  });

  rows.sort((left, right) => (orderByProductId.get(left.id) ?? 0) - (orderByProductId.get(right.id) ?? 0));

  return [rows, total];
}

// Loads every Product fully mapped, with no pagination, search, or sort — for the public Lander catalog
// and related strip, which gate on lander readiness and so need each Product's images, category, key
// features, and standard assemblies. Callers order in memory. The catalog is small, so the single
// relational read (plus the batched product-bay read) stays cheap.
export async function listAllProducts({ db }: { db: Db }): Promise<Product[]> {
  const rows = await db.query.products.findMany({
    columns: productListColumns,
    where: notRemoved(products),
    with: productListWith,
  });
  const productBaysByProductId = await listProductBaysByProductIds({
    db,
    productIds: rows.map((row) => row.id),
  });

  return rows.map((row) => mapProductListRow(row, productBaysByProductId.get(row.id) ?? []));
}

function mapProductListRow(row: ProductListRow, productBaysForRow: ProductBay[] = []): Product {
  return mapProduct({
    ...row,
    assemblies: row.assemblies.map(mapAssembly),
    productBays: productBaysForRow,
  });
}

function buildProductListWhere(listInput: ProductListInput): SQL {
  const conditions: SQL[] = [notRemoved(products)];

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

  if (listInput.columnFilters.rangeId) {
    conditions.push(eq(products.rangeId, listInput.columnFilters.rangeId));
  }

  if (listInput.columnFilters.variantId) {
    conditions.push(eq(products.variantId, listInput.columnFilters.variantId));
  }

  return and(...conditions) as SQL;
}

export async function getProduct({ db, id }: { db: Db; id: UUID }): Promise<Product> {
  const { row, productBays: productBaysForProduct } = await loadProductDetailRow({ db, id, includeRemoved: false });

  return mapProductListRow(row, productBaysForProduct);
}

export async function getQuoteProductOption({ db, id }: { db: Db; id: UUID }): Promise<Product> {
  const { row, productBays: productBaysForProduct } = await loadProductDetailRow({ db, id, includeRemoved: true });

  return mapProductListRow(row, productBaysForProduct);
}

// Reads the Product detail row plus the stored Product image references and the owning Range's logo in a
// single pass, so the brochure render path can build the read model (with images projected key-free) and
// resolve the internal storage keys — including the top-right Range logo — without follow-up queries.
export async function getProductBrochureSource({
  db,
  id,
}: {
  db: Db;
  id: UUID;
}): Promise<{ images: ProductImageStore; product: Product; rangeLogo: StoredFile | null }> {
  return getProductBrochureSourceByVisibility({ db, id, includeRemoved: false });
}

export async function getHistoricalProductBrochureSource({
  db,
  id,
}: {
  db: Db;
  id: UUID;
}): Promise<{ images: ProductImageStore; product: Product; rangeLogo: StoredFile | null }> {
  return getProductBrochureSourceByVisibility({ db, id, includeRemoved: true });
}

async function getProductBrochureSourceByVisibility({
  db,
  id,
  includeRemoved,
}: {
  db: Db;
  id: UUID;
  includeRemoved: boolean;
}): Promise<{ images: ProductImageStore; product: Product; rangeLogo: StoredFile | null }> {
  const {
    rangeLogo,
    row,
    productBays: productBaysForProduct,
  } = await loadProductDetailRow({
    db,
    id,
    includeRemoved,
  });

  return {
    images: row.images,
    product: mapProductListRow(row, productBaysForProduct),
    rangeLogo,
  };
}

async function loadProductDetailRow({
  db,
  id,
  includeRemoved,
}: {
  db: Db;
  id: UUID;
  includeRemoved: boolean;
}): Promise<{
  productBays: ProductBay[];
  rangeLogo: StoredFile | null;
  row: ProductListRow;
}> {
  const productWhere = includeRemoved ? eq(products.id, id) : and(eq(products.id, id), notRemoved(products));
  // The Product's Bays key off the same id as the main read, so load both in parallel rather than
  // waiting on the Product row before fetching its Bays.
  const [row, productBays] = await Promise.all([
    db.query.products.findFirst({
      where: productWhere,
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
        // The brochure's top-right logo is the owning Range's logo; load it here so the brochure source
        // resolves it from the same read. Other callers (getProduct) ignore it.
        range: { columns: { id: true, logo: true, name: true } },
        variant: { columns: { id: true, rangeId: true, name: true } },
      },
    }),
    listProductBays({ db, productId: id }),
  ]);

  if (!row) {
    throw new ProductNotFoundError(id);
  }

  return { productBays, rangeLogo: row.range?.logo ?? null, row };
}

export async function getProductDocuments({ db, productId }: { db: Db; productId: UUID }): Promise<ProductDocument[]> {
  await assertProductExists({ db, productId });

  const rows = await selectProductDocumentSummary(db)
    .where(eq(documents.productId, productId))
    .orderBy(asc(documents.filename));

  return rows.map(mapProductDocumentSummary);
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
  const document = await findProductDocumentSummaryRow({ db, documentId, productId });

  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }

  return {
    document: mapDocumentSummary(document),
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
  const row = await findProductDocumentSummaryRow({ db, documentId, productId });

  if (!row) {
    throw new DocumentNotFoundError(documentId);
  }

  return row;
}

async function findProductDocumentSummaryRow({
  db,
  documentId,
  productId,
}: {
  db: Db;
  documentId: UUID;
  productId: UUID;
}): Promise<DocumentSummaryRow | null> {
  const [row] = await selectProductDocumentSummary(db)
    .where(and(eq(documents.productId, productId), eq(documents.id, documentId)))
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
      const range = await assertActiveProductRange({ rangeId: productInput.rangeId, tx });

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
      const variant = await assertActiveProductRangeVariant({
        rangeId: row.rangeId,
        tx,
        variantId: row.variantId,
      });
      const after = { ...row, assemblies, productBays: syncedProductBays, range, variant };

      await recordAuditCreate({ db: tx, descriptor: productAuditDescriptor, actorUserId, input: after });

      return mapProduct(after);
    });
  } catch (error) {
    throw mapProductConstraintViolation(error, input);
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
      const [before] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, input.id), notRemoved(products)))
        .for('update');

      if (!before) {
        throw new ProductNotFoundError(input.id);
      }

      const range = await assertActiveProductRange({ rangeId: input.rangeId, tx });
      const beforeVariant = await assertActiveProductRangeVariant({
        rangeId: before.rangeId,
        tx,
        variantId: before.variantId,
      });

      const beforeAssemblies = await listAssemblies({ tx, productId: input.id });
      const beforeProductBays = await listProductBays({ db: tx, productId: input.id });
      const desiredAssemblies = input.assemblies ?? beforeAssemblies;
      const desiredProductBays = input.productBays ?? beforeProductBays;
      const patch = {
        basePrice: input.basePrice,
        // Marketing text fields fold into the Product update; omitting them preserves the stored value.
        category: input.category === undefined ? before.category : input.category,
        currencyCode: input.currencyCode,
        description: input.description,
        displayOrder: input.displayOrder ?? before.displayOrder,
        keyFeatures: input.keyFeatures ?? before.keyFeatures,
        technicalDetails: input.technicalDetails ?? before.technicalDetails,
        buildTimeDays: input.buildTimeDays,
        modelCode: input.modelCode,
        name: input.name,
        nameHighlight: input.nameHighlight === undefined ? before.nameHighlight : input.nameHighlight,
        rangeId: input.rangeId,
        // A Variant is only valid inside its owning Range. Range changes deliberately clear it even if a
        // stale client sends the old Variant id with the new Range.
        variantId:
          input.rangeId === before.rangeId
            ? input.variantId === undefined
              ? before.variantId
              : input.variantId
            : null,
        requiresVinNumber: input.requiresVinNumber,
        brochureEnabled: input.brochureEnabled,
        landerEnabled: input.landerEnabled,
        thumbnailDataUrl: input.thumbnailDataUrl,
      };
      const after = { ...before, ...patch, assemblies: desiredAssemblies, productBays: desiredProductBays };
      const changes = diffAuditUpdate(
        productAuditDescriptor,
        { ...before, assemblies: beforeAssemblies, productBays: beforeProductBays },
        after,
      );

      if (!changes) {
        return mapProduct({
          ...before,
          assemblies: beforeAssemblies,
          productBays: beforeProductBays,
          range,
          variant: beforeVariant,
        });
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
      const syncedProductBays =
        input.productBays === undefined
          ? beforeProductBays
          : await syncProductBays({
              tx,
              productId: row.id,
              desired: input.productBays,
            });
      const variant = await assertActiveProductRangeVariant({
        rangeId: row.rangeId,
        tx,
        variantId: row.variantId,
      });
      const afterWithChildren = { ...row, assemblies, productBays: syncedProductBays, range, variant };

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
    throw mapProductConstraintViolation(error, input);
  }
}

export async function removeProduct({ db, id, actorUserId }: { db: Db; id: UUID; actorUserId: AuthId }): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, id), notRemoved(products)))
      .for('update');

    if (!before) {
      throw new ProductNotFoundError(id);
    }

    const [assemblies, productBaysForProduct] = await Promise.all([
      listAssemblies({ tx, productId: id }),
      listProductBays({ db: tx, productId: id }),
    ]);
    const now = new Date();

    await tx.update(products).set({ deletedAt: now, updatedAt: now }).where(eq(products.id, id));
    await recordAuditDelete({
      db: tx,
      descriptor: productAuditDescriptor,
      actorUserId,
      input: { ...before, assemblies, productBays: productBaysForProduct },
    });
  });
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

export async function listProductBays({
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
      scheduleOrigin: row.bayScheduleOrigin,
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
    .where(and(eq(products.id, productId), notRemoved(products)))
    .limit(1);

  if (!product) {
    throw new ProductNotFoundError(productId);
  }
}

async function assertActiveProductRange({
  rangeId,
  tx,
}: {
  rangeId: UUID;
  tx: DatabaseTransaction;
}): Promise<ProductRangeOption> {
  const [range] = await tx
    .select({ id: productRanges.id, name: productRanges.name })
    .from(productRanges)
    .where(and(eq(productRanges.id, rangeId), notRemoved(productRanges)))
    .for('update');

  if (!range) {
    throw new ProductRangeReferenceNotFoundError(rangeId);
  }

  return ProductRangeOptionSchema.parse(range);
}

async function assertActiveProductRangeVariant({
  rangeId,
  tx,
  variantId,
}: {
  rangeId: UUID;
  tx: DatabaseTransaction;
  variantId: UUID | null;
}): Promise<ProductRangeVariantOption | null> {
  if (!variantId) {
    return null;
  }

  const [variant] = await tx
    .select({ id: productRangeVariants.id, rangeId: productRangeVariants.rangeId, name: productRangeVariants.name })
    .from(productRangeVariants)
    .where(
      and(
        eq(productRangeVariants.id, variantId),
        eq(productRangeVariants.rangeId, rangeId),
        notRemoved(productRangeVariants),
      ),
    )
    .for('update');

  if (!variant) {
    throw new ProductRangeVariantReferenceNotFoundError(rangeId, variantId);
  }

  return ProductRangeVariantOptionSchema.parse(variant);
}

// `displayOrder` is derived the same way syncAssemblies assigns it (dense per kind from array
// position) so pure reorders still register as changes — updateProduct skips the write entirely when
// the audit diff is empty.
function toAuditAssemblies(assemblies: Assembly[] | NonNullable<ProductUpdateInput['assemblies']>) {
  const kindCounts = { optional: 0, standard: 0 };

  return assemblies.map((assembly) => {
    const displayOrder = kindCounts[assembly.kind]++;
    const parts = assembly.parts
      .map((part) => ({ partId: part.partId, quantity: part.quantity }))
      .toSorted((left, right) => left.partId.localeCompare(right.partId));

    if (assembly.kind === 'standard') {
      return {
        id: assembly.id,
        kind: 'standard' as const,
        name: assembly.name,
        displayOrder,
        parts,
      };
    }

    return {
      id: assembly.id,
      kind: 'optional' as const,
      name: assembly.name,
      displayOrder,
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

  if (sortBy === 'displayOrder') {
    return products.displayOrder;
  }

  if (sortBy === 'modelCode') {
    return products.modelCode;
  }

  if (sortBy === 'updatedAt') {
    return products.updatedAt;
  }

  return products.name;
}

function mapProductConstraintViolation(
  error: unknown,
  input: { modelCode: string; name: string; rangeId: UUID; variantId?: UUID | null | undefined },
): Error {
  // The `range_id` FK (NOT NULL, ON DELETE RESTRICT) is the source of truth for the Product → Range
  // relationship; a bad reference surfaces as a constraint violation we translate into a domain error.
  const foreignKey = getForeignKeyViolationConstraint(error);

  if (foreignKey?.includes(PRODUCT_RANGE_FOREIGN_KEY) || foreignKey?.includes('range_id')) {
    return new ProductRangeReferenceNotFoundError(input.rangeId);
  }

  if (input.variantId && foreignKey?.includes(PRODUCT_VARIANT_RANGE_FOREIGN_KEY)) {
    return new ProductRangeVariantReferenceNotFoundError(input.rangeId, input.variantId);
  }

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
