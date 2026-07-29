import {
  createEscapedContainsSearchCondition,
  currentOwnerCustomerId,
  customers,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  jobs,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  withPagination,
} from '@pkg/db';
import {
  type ProductUnitBuildState,
  ProductUnitDetail,
  ProductUnitFilterOptions,
  type ProductUnitListInput,
  type ProductUnitListResult,
  ProductUnitSummary,
  UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';

import { loadAsBuiltSpec } from './product-unit-as-built.js';
import { ProductUnitNotFoundError } from './product-unit-errors.js';

/** `NULL` here means Stock, which is why the owner filter has to distinguish "no rows" from "no match". */
const currentOwnerId = currentOwnerCustomerId(productUnits.id);

/**
 * The Job Completion of the Unit's Build Job — its earliest live Job, since a rework can only follow a
 * build. A Unit is On Hand once that date exists, and still in build before it. Cancelled Jobs are
 * skipped: a cancelled build never happened, so leaving it in would strand a rebuilt Unit in build
 * forever behind a Job that will never complete. `id` breaks ties so same-instant Jobs order stably.
 */
const buildCompletedOn = sql<string | null>`(
  select ${jobs.completedOn}
  from ${jobs}
  where ${jobs.productUnitId} = ${productUnits.id} and ${jobs.cancelledAt} is null
  order by ${jobs.createdAt} asc, ${jobs.id} asc
  limit 1
)`;

/** One projection for both reads, so the list and the detail can never drift apart. */
const productUnitSelection = {
  buildCompletedOn: buildCompletedOn.as('build_completed_on'),
  createdAt: productUnits.createdAt,
  id: productUnits.id,
  ownerId: currentOwnerId.as('owner_id'),
  productId: products.id,
  productModelCode: products.modelCode,
  productName: products.name,
  productSerialNumber: productUnits.productSerialNumber,
  vinNumber: productUnits.vinNumber,
};

export async function listProductUnits({
  db,
  input,
}: {
  db: Db;
  input: ProductUnitListInput;
}): Promise<ProductUnitListResult> {
  const where = buildProductUnitListWhere(input);
  const sortColumn = getProductUnitSortColumn(input.sortBy);

  const rows = await withPagination(
    db
      .select(productUnitSelection)
      .from(productUnits)
      .innerJoin(products, eq(products.id, productUnits.productId))
      .where(where)
      .orderBy(getSortOrder(sortColumn, input.sortDirection), asc(productUnits.id))
      .$dynamic(),
    input,
  );

  const owners = await loadOwners(
    db,
    rows.map((row) => row.ownerId),
  );

  return {
    items: rows.map((row) => toSummary(row, owners)),
    total: await db.$count(productUnits, where),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

/**
 * The values worth offering as Units-list filters: only Customers that hold a Unit right now and only
 * Products that have one. Scoped to Units so Sales can read them without Customer or Product
 * access, and so the filters can never offer a choice that returns nothing.
 */
export async function listProductUnitFilterOptions({ db }: { db: Db }): Promise<ProductUnitFilterOptions> {
  const [owners, ownedProducts] = await Promise.all([
    db
      .selectDistinct({ companyName: customers.companyName, id: customers.id })
      .from(customers)
      .innerJoin(productUnits, sql`${currentOwnerId} = ${customers.id}`)
      .orderBy(asc(customers.companyName)),
    db
      .selectDistinct({ id: products.id, modelCode: products.modelCode, name: products.name })
      .from(products)
      .innerJoin(productUnits, eq(productUnits.productId, products.id))
      .orderBy(asc(products.name)),
  ]);

  return ProductUnitFilterOptions.parse({ owners, products: ownedProducts });
}

export async function getProductUnit({
  db,
  id,
}: {
  db: Db | DatabaseTransaction;
  id: UUID;
}): Promise<ProductUnitDetail> {
  const [row] = await db
    .select(productUnitSelection)
    .from(productUnits)
    .innerJoin(products, eq(products.id, productUnits.productId))
    .where(eq(productUnits.id, id));

  if (!row) {
    throw new ProductUnitNotFoundError(id);
  }

  const [owners, unitJobs, transfers, asBuiltSpec] = await Promise.all([
    loadOwners(db, [row.ownerId]),
    db.query.jobs.findMany({
      columns: { cancelledAt: true, code: true, completedOn: true, createdAt: true, id: true },
      orderBy: [asc(jobs.createdAt), asc(jobs.id)],
      where: eq(jobs.productUnitId, id),
    }),
    db.query.productUnitOwnershipTransfers.findMany({
      orderBy: [asc(productUnitOwnershipTransfers.occurredOn), asc(productUnitOwnershipTransfers.createdAt)],
      where: eq(productUnitOwnershipTransfers.productUnitId, id),
      with: {
        actor: { columns: { id: true, name: true } },
        fromCustomer: { columns: { companyName: true, id: true } },
        sourceQuote: { columns: { code: true, id: true } },
        toCustomer: { columns: { companyName: true, id: true } },
      },
    }),
    loadAsBuiltSpec({ db, productUnitId: id }),
  ]);

  return ProductUnitDetail.parse({
    ...toSummary(row, owners),
    asBuiltSpec,
    jobs: unitJobs.map((job) => ({
      id: job.id,
      cancelledAt: job.cancelledAt?.toISOString() ?? null,
      code: job.code,
      completedOn: job.completedOn,
      createdAt: job.createdAt.toISOString(),
    })),
    ownershipHistory: transfers.map((transfer) => ({
      id: transfer.id,
      actor: transfer.actor,
      createdAt: transfer.createdAt.toISOString(),
      fromCustomer: transfer.fromCustomer,
      note: transfer.note,
      occurredOn: transfer.occurredOn,
      sourceQuote: transfer.sourceQuote,
      toCustomer: transfer.toCustomer,
    })),
  });
}

type OwnersById = Map<string, { id: UUID; companyName: string }>;

/** One batched read for the page's derived owners: the owner id is a subquery, not a joinable column. */
async function loadOwners(db: Db | DatabaseTransaction, ownerIds: (string | null)[]): Promise<OwnersById> {
  const ids = [...new Set(ownerIds.filter((ownerId): ownerId is string => ownerId !== null))];

  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ companyName: customers.companyName, id: customers.id })
    .from(customers)
    .where(inArray(customers.id, ids));

  return new Map(rows.map((row) => [row.id, { id: UUID.parse(row.id), companyName: row.companyName }]));
}

type ProductUnitListRow = {
  [Key in keyof typeof productUnitSelection]: Key extends 'createdAt'
    ? Date
    : Key extends 'buildCompletedOn' | 'ownerId' | 'vinNumber'
      ? string | null
      : string;
};

function toSummary(row: ProductUnitListRow, owners: OwnersById): ProductUnitSummary {
  return ProductUnitSummary.parse({
    id: row.id,
    buildState: toBuildState(row.buildCompletedOn),
    createdAt: row.createdAt.toISOString(),
    owner: row.ownerId ? (owners.get(row.ownerId) ?? null) : null,
    product: { id: row.productId, modelCode: row.productModelCode, name: row.productName },
    productSerialNumber: row.productSerialNumber,
    vinNumber: row.vinNumber,
  });
}

function toBuildState(completedOn: string | null): ProductUnitBuildState {
  return completedOn === null ? 'in-build' : 'on-hand';
}

function buildProductUnitListWhere(input: ProductUnitListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.search) {
    conditions.push(createEscapedContainsSearchCondition(sql`${productUnits.productSerialNumber}`, input.search));
  }

  if (input.columnFilters.productId) {
    conditions.push(eq(productUnits.productId, input.columnFilters.productId));
  }

  if (input.columnFilters.owner === 'stock') {
    conditions.push(sql`${currentOwnerId} is null`);
  } else if (input.columnFilters.owner) {
    conditions.push(sql`${currentOwnerId} = ${input.columnFilters.owner}`);
  }

  if (input.columnFilters.buildState === 'on-hand') {
    conditions.push(sql`${buildCompletedOn} is not null`);
  } else if (input.columnFilters.buildState === 'in-build') {
    conditions.push(sql`${buildCompletedOn} is null`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function getProductUnitSortColumn(sortBy: ProductUnitListInput['sortBy']) {
  if (sortBy === 'id') return productUnits.id;
  if (sortBy === 'productSerialNumber') return productUnits.productSerialNumber;

  return productUnits.createdAt;
}
