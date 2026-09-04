import {
  createGlobalSearchCondition,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  user,
  withPagination,
} from '@pkg/db';
import {
  customers,
  jobBuildSpecAssemblies,
  jobs,
  products,
  quoteSelectedAssemblies,
  quotes,
  quoteWorkItemParts,
  quoteWorkItems,
} from '@pkg/db/equipment';
import { addDateOnlyDays, parseDateOnlyParts, toPlantDateOnly } from '@pkg/domain';
import { parseJobCodeSearch, QUOTE_SALESPERSON_ROLES, selectReworkBuildSpec } from '@pkg/domain/equipment';
import { DateOnlyIso, getNextCursor, UUID } from '@pkg/schema';
import {
  CompetingAllocationQuote,
  type PriorityQuote,
  parseQuoteCodeNumber,
  type QuoteDetail,
  type QuoteListInput,
  type QuoteListResult,
  type QuoteProductBayAvailabilityInput,
  QuoteProductBayAvailabilityResult,
  type QuoteSortBy,
  type QuoteSummary,
  UpcomingDeliveryQuotesResult,
  type UserListResult,
} from '@pkg/schema/equipment';
import { and, asc, eq, inArray, isNotNull, isNull, ne, or, type SQL, sql } from 'drizzle-orm';

import { listBayQueueAvailability } from '../jobs/job-read-service.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { listProductBays } from '../products/product-service.js';
import { quoteEverPlacedAUnit } from '../units/product-unit-service.js';
import { mapUser } from '../users/user-service.js';
import {
  QuoteInvalidReferenceError,
  QuoteNotFoundError,
  QuoteProductBayAvailabilityNotApplicableError,
} from './quote-errors.js';
import {
  mapPriorityQuote,
  mapQuoteDetail,
  mapQuoteSummary,
  mapUpcomingDeliveryQuote,
  type QuoteLinkedJobRow,
} from './quote-mappers.js';
import { narrowQuoteOffering } from './quote-offering.js';
import { getSelectedAssembliesByQuoteId, type QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';
import { getWorkItemsByQuoteId, type QuoteWorkItemRow } from './quote-work-items.js';

const PRIORITY_QUOTE_WINDOW_MONTHS = 2;
const UPCOMING_DELIVERY_WINDOW_DAYS = 30;

export async function listQuotes({ db, input }: { db: Db; input: QuoteListInput }): Promise<QuoteListResult> {
  const where = buildQuoteListWhere(input);
  const sortColumn = getQuoteSortColumn(input.sortBy);
  const orderBy = getSortOrder(sortColumn, input.sortDirection);

  const rowsQuery = withPagination(
    db
      .select({
        quote: quotes,
        customerCompanyName: customers.companyName,
        customerThumbnailDataUrl: customers.thumbnailDataUrl,
        productBuildTimeDays: products.buildTimeDays,
        productCurrencyCode: products.currencyCode,
        productModelCode: products.modelCode,
        productName: products.name,
        productThumbnailDataUrl: products.thumbnailDataUrl,
        salesPersonEmail: user.email,
        salesPersonName: user.name,
        salesPersonThumbnailDataUrl: user.image,
      })
      .from(quotes)
      .innerJoin(customers, eq(quotes.customerId, customers.id))
      .leftJoin(products, eq(quotes.productId, products.id))
      .leftJoin(user, eq(quotes.salesPersonId, user.id))
      .where(where)
      .orderBy(orderBy, asc(quotes.id))
      .$dynamic(),
    input,
  );

  const totalQuery = db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(products, eq(quotes.productId, products.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([rowsQuery, totalQuery]);
  const { jobByQuoteId, selectedAssembliesByQuoteId, workItemsByQuoteId } = await loadQuoteAssociations({
    db,
    includeJobs: true,
    quoteIds: rows.map((row) => row.quote.id),
  });
  const total = Number(totalRow?.count ?? 0);
  const items = rows.map((row) =>
    mapQuoteSummary(
      row,
      jobByQuoteId.get(row.quote.id) ?? null,
      selectedAssembliesByQuoteId.get(row.quote.id) ?? [],
      workItemsByQuoteId.get(row.quote.id) ?? [],
    ),
  );

  return {
    items,
    nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }),
    total,
  };
}

export async function listPriorityQuotes({
  clock = () => new Date(),
  customerId,
  db,
}: {
  clock?: () => Date;
  customerId?: UUID;
  db: Db;
}): Promise<PriorityQuote[]> {
  const priorityWindowEndDate = getPriorityQuoteWindowEndDate(clock());
  const earliestDeliveryDate = getEarliestDeliveryDateExpression();

  const rows = await db
    .select({
      quote: quotes,
      customerCompanyName: customers.companyName,
      customerThumbnailDataUrl: customers.thumbnailDataUrl,
      earliestDeliveryDate,
      productBuildTimeDays: products.buildTimeDays,
      productCurrencyCode: products.currencyCode,
      productModelCode: products.modelCode,
      productName: products.name,
      productThumbnailDataUrl: products.thumbnailDataUrl,
      salesPersonEmail: user.email,
      salesPersonName: user.name,
      salesPersonThumbnailDataUrl: user.image,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(products, eq(quotes.productId, products.id))
    .leftJoin(user, eq(quotes.salesPersonId, user.id))
    .where(
      and(
        eq(quotes.status, 'accepted'),
        isNull(quotes.productUnitId),
        customerId ? eq(quotes.customerId, customerId) : undefined,
        sql`${earliestDeliveryDate} is not null`,
        sql`${earliestDeliveryDate} <= ${priorityWindowEndDate}::date`,
        sql`not exists (
          select 1
          from ${jobs}
          where ${jobs.quoteId} = ${quotes.id}
            and ${jobs.cancelledAt} is null
        )`,
      ),
    )
    .orderBy(asc(earliestDeliveryDate), asc(quotes.code), asc(quotes.id));

  const { jobByQuoteId, selectedAssembliesByQuoteId, workItemsByQuoteId } = await loadQuoteAssociations({
    db,
    includeJobs: true,
    quoteIds: rows.map((row) => row.quote.id),
  });

  return rows.map((row) =>
    mapPriorityQuote(
      row,
      jobByQuoteId.get(row.quote.id) ?? null,
      selectedAssembliesByQuoteId.get(row.quote.id) ?? [],
      workItemsByQuoteId.get(row.quote.id) ?? [],
    ),
  );
}

/** The complete work queue; unlike Job Start Alerts, it is not limited to Quotes due soon. */
export async function listAwaitingJobCreationQuotes({ db }: { db: Db }): Promise<QuoteSummary[]> {
  const earliestDeliveryDate = getEarliestDeliveryDateExpression();
  const rows = await db
    .select({
      quote: quotes,
      customerCompanyName: customers.companyName,
      customerThumbnailDataUrl: customers.thumbnailDataUrl,
      productBuildTimeDays: products.buildTimeDays,
      productCurrencyCode: products.currencyCode,
      productModelCode: products.modelCode,
      productName: products.name,
      productThumbnailDataUrl: products.thumbnailDataUrl,
      salesPersonEmail: user.email,
      salesPersonName: user.name,
      salesPersonThumbnailDataUrl: user.image,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(products, eq(quotes.productId, products.id))
    .leftJoin(user, eq(quotes.salesPersonId, user.id))
    .where(
      and(
        eq(quotes.status, 'accepted'),
        isNull(quotes.productUnitId),
        sql`not exists (
          select 1
          from ${jobs}
          where ${jobs.quoteId} = ${quotes.id}
            and ${jobs.cancelledAt} is null
        )`,
      ),
    )
    .orderBy(asc(earliestDeliveryDate), asc(quotes.code), asc(quotes.id));
  const { selectedAssembliesByQuoteId, workItemsByQuoteId } = await loadQuoteAssociations({
    db,
    quoteIds: rows.map((row) => row.quote.id),
  });

  return rows.map((row) =>
    mapQuoteSummary(
      row,
      null,
      selectedAssembliesByQuoteId.get(row.quote.id) ?? [],
      workItemsByQuoteId.get(row.quote.id) ?? [],
    ),
  );
}

// A dashboard read, but a QuoteSummary-shaped list like listQuotes/listPriorityQuotes, so it lives
// here with the shared summary mapper rather than in quote-report-service (which owns aggregates).
export async function listUpcomingDeliveryQuotes({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<UpcomingDeliveryQuotesResult> {
  const today = toPlantDateOnly(clock());
  const windowEndDate = addDateOnlyDays(today, UPCOMING_DELIVERY_WINDOW_DAYS);

  const rows = await db
    .select({
      quote: quotes,
      customerCompanyName: customers.companyName,
      customerThumbnailDataUrl: customers.thumbnailDataUrl,
      productBuildTimeDays: products.buildTimeDays,
      productCurrencyCode: products.currencyCode,
      productModelCode: products.modelCode,
      productName: products.name,
      productThumbnailDataUrl: products.thumbnailDataUrl,
      salesPersonEmail: user.email,
      salesPersonName: user.name,
      salesPersonThumbnailDataUrl: user.image,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(products, eq(quotes.productId, products.id))
    .leftJoin(user, eq(quotes.salesPersonId, user.id))
    .where(
      and(
        eq(quotes.status, 'accepted'),
        sql`${quotes.plannedDeliveryDate} is not null`,
        sql`${quotes.plannedDeliveryDate} <= ${windowEndDate}::date`,
      ),
    )
    .orderBy(asc(quotes.plannedDeliveryDate), asc(quotes.code), asc(quotes.id));

  const { jobByQuoteId, selectedAssembliesByQuoteId, workItemsByQuoteId } = await loadQuoteAssociations({
    db,
    includeJobs: true,
    quoteIds: rows.map((row) => row.quote.id),
  });

  return UpcomingDeliveryQuotesResult.parse({
    items: rows.map((row) =>
      mapUpcomingDeliveryQuote(
        row,
        jobByQuoteId.get(row.quote.id) ?? null,
        selectedAssembliesByQuoteId.get(row.quote.id) ?? [],
        workItemsByQuoteId.get(row.quote.id) ?? [],
      ),
    ),
    today,
    windowEndDate,
  });
}

export async function getQuote({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<QuoteDetail> {
  const row = await db.query.quotes.findFirst({
    where: eq(quotes.id, id),
    with: {
      customer: {
        columns: {
          address: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
          thumbnailDataUrl: true,
          vatNumber: true,
        },
      },
      jobs: {
        columns: {
          cancelledAt: true,
          code: true,
          description: true,
          id: true,
        },
        orderBy: [asc(jobs.code), asc(jobs.id)],
      },
      product: {
        columns: {
          buildTimeDays: true,
          currencyCode: true,
          description: true,
          modelCode: true,
          name: true,
          requiresVinNumber: true,
          thumbnailDataUrl: true,
        },
      },
      productUnit: {
        columns: {
          id: true,
          productSerialNumber: true,
          vinNumber: true,
        },
      },
      salesPerson: {
        columns: {
          email: true,
          image: true,
          name: true,
        },
      },
      selectedAssemblies: {
        orderBy: [asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id)],
      },
      workItems: {
        orderBy: [asc(quoteWorkItems.position), asc(quoteWorkItems.createdAt), asc(quoteWorkItems.id)],
        with: {
          parts: {
            orderBy: [asc(quoteWorkItemParts.position), asc(quoteWorkItemParts.createdAt), asc(quoteWorkItemParts.id)],
          },
        },
      },
    },
  });

  if (!row) {
    throw new QuoteNotFoundError(id);
  }

  const offering = narrowQuoteOffering(row);
  const [assemblies, productBaysForQuote, competingAllocationQuotes, reworkRequired, everPlacedAUnit] =
    await Promise.all([
      offering.kind === 'product' ? listAssemblies({ tx: db, productId: offering.productId }) : Promise.resolve([]),
      offering.kind === 'product' ? listProductBays({ db, productId: offering.productId }) : Promise.resolve([]),
      offering.kind === 'product' && offering.productUnitId
        ? listCompetingAllocationQuotes({ db, quoteId: row.id, productUnitId: offering.productUnitId })
        : Promise.resolve([]),
      offering.kind === 'product' && offering.productUnitId
        ? allocationQuoteRequiresRework({
            db,
            productUnitId: offering.productUnitId,
            selectedAssemblies: row.selectedAssemblies,
          })
        : Promise.resolve(false),
      // Durable proof this deal sourced production: Reassignment moves its build Job away, and the
      // Locked derivation must keep reading true afterwards. See `quoteEverPlacedAUnit`.
      quoteEverPlacedAUnit({ db, quoteId: row.id }),
    ]);

  return mapQuoteDetail(
    { ...row, everPlacedAUnit },
    assemblies,
    productBaysForQuote,
    competingAllocationQuotes,
    reworkRequired,
  );
}

async function allocationQuoteRequiresRework({
  db,
  productUnitId,
  selectedAssemblies,
}: {
  db: Db | DatabaseTransaction;
  productUnitId: UUID;
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[];
}): Promise<boolean> {
  const asBuiltRows = await db
    .select({ productAssemblyId: jobBuildSpecAssemblies.productAssemblyId })
    .from(jobBuildSpecAssemblies)
    .innerJoin(jobs, eq(jobs.id, jobBuildSpecAssemblies.jobId))
    .where(and(eq(jobs.productUnitId, productUnitId), isNull(jobs.cancelledAt)));

  return (
    selectReworkBuildSpec({
      asBuiltAssemblyIds: asBuiltRows.flatMap((row) =>
        row.productAssemblyId ? [UUID.parse(row.productAssemblyId)] : [],
      ),
      quoteBuildSpec: selectedAssemblies.map((assembly) => ({
        assemblyName: assembly.quotedName,
        productAssemblyId: assembly.productAssemblyId ? UUID.parse(assembly.productAssemblyId) : null,
      })),
    }).length > 0
  );
}

async function listCompetingAllocationQuotes({
  db,
  productUnitId,
  quoteId,
}: {
  db: Db | DatabaseTransaction;
  productUnitId: UUID;
  quoteId: UUID;
}) {
  const rows = await db
    .select({
      code: quotes.code,
      customerCompanyName: customers.companyName,
      id: quotes.id,
      salesPersonName: user.name,
      status: quotes.status,
    })
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .leftJoin(user, eq(user.id, quotes.salesPersonId))
    .where(
      and(eq(quotes.productUnitId, productUnitId), ne(quotes.id, quoteId), inArray(quotes.status, ['draft', 'sent'])),
    )
    .orderBy(asc(quotes.code), asc(quotes.id));

  return rows.map((row) => CompetingAllocationQuote.parse(row));
}

export async function getQuoteProductBayAvailability({
  db,
  input,
}: {
  db: Db | DatabaseTransaction;
  input: QuoteProductBayAvailabilityInput;
}): Promise<QuoteProductBayAvailabilityResult> {
  const quote = await getQuote({ db, id: input.quoteId });
  if (quote.kind === 'custom') {
    throw new QuoteProductBayAvailabilityNotApplicableError(
      'Product Bay availability is only available for Product Quotes.',
    );
  }

  if (!quote.productId || quote.product === null) {
    throw new QuoteInvalidReferenceError('Quote product was not found.');
  }

  const productBaysForQuote = (await listProductBays({ db, productId: quote.productId })).filter(
    (productBay) => !productBay.bay.disabledAt,
  );
  const availabilityByBayId = new Map(
    (
      await listBayQueueAvailability({
        bayIds: productBaysForQuote.map((productBay) => productBay.bayId),
        db,
      })
    ).map((availability) => [availability.bayId, availability]),
  );
  const bays = productBaysForQuote.flatMap((productBay) => {
    const availability = availabilityByBayId.get(productBay.bayId);

    return availability
      ? [
          {
            bayId: productBay.bayId,
            defaultWorkingDays: productBay.defaultWorkingDays,
            department: availability.department,
            name: availability.name,
            nextAvailableDate: availability.nextAvailableDate,
            waitWorkingDays: availability.waitWorkingDays,
          },
        ]
      : [];
  });
  const maxBayWaitWorkingDays = Math.max(0, ...bays.map((bay) => bay.waitWorkingDays));

  return QuoteProductBayAvailabilityResult.parse({
    bays,
    buildTimeDays: quote.product.buildTimeDays,
    defaultLeadTimeWorkingDays: quote.product.buildTimeDays + maxBayWaitWorkingDays,
    maxBayWaitWorkingDays,
  });
}

export async function listQuoteSalespeople({ db }: { db: Db }): Promise<UserListResult> {
  const rows = await db.query.user.findMany({
    where: inArray(user.role, [...QUOTE_SALESPERSON_ROLES]),
    orderBy: [asc(user.name), asc(user.id)],
  });

  return {
    users: rows.map((row) =>
      mapUser({
        assistantEnabled: row.assistantEnabled,
        contractingRole: row.contractingRole,
        departments: [],
        email: row.email,
        emailVerified: row.emailVerified,
        id: row.id,
        isDevice: row.isDevice,
        name: row.name,
        phoneNumber: row.phoneNumber,
        role: row.role,
        image: row.image,
      }),
    ),
  };
}

export async function loadQuoteAssociations({
  db,
  includeJobs = false,
  quoteIds,
}: {
  db: Db | DatabaseTransaction;
  includeJobs?: boolean;
  quoteIds: readonly UUID[];
}): Promise<{
  jobByQuoteId: Map<UUID, QuoteLinkedJobRow>;
  selectedAssembliesByQuoteId: Map<UUID, QuoteSelectedAssemblyRow[]>;
  workItemsByQuoteId: Map<UUID, QuoteWorkItemRow[]>;
}> {
  const [selectedAssembliesByQuoteId, workItemsByQuoteId, jobByQuoteId] = await Promise.all([
    getSelectedAssembliesByQuoteId({ db, quoteIds }),
    getWorkItemsByQuoteId({ db, quoteIds }),
    includeJobs ? getJobByQuoteId({ db, quoteIds }) : Promise.resolve(new Map<UUID, QuoteLinkedJobRow>()),
  ]);

  return { jobByQuoteId, selectedAssembliesByQuoteId, workItemsByQuoteId };
}

export async function getJobByQuoteId({
  db,
  quoteIds,
}: {
  db: Db | DatabaseTransaction;
  quoteIds: readonly UUID[];
}): Promise<Map<UUID, QuoteLinkedJobRow>> {
  if (quoteIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      jobCode: jobs.code,
      jobDescription: jobs.description,
      jobId: jobs.id,
      quoteId: jobs.quoteId,
    })
    .from(jobs)
    .where(and(inArray(jobs.quoteId, quoteIds), isNull(jobs.cancelledAt)));
  const byQuoteId = new Map<UUID, QuoteLinkedJobRow>();

  for (const row of rows) {
    // The `inArray` filter already excluded quoteless Jobs; the narrowing just satisfies the nullable column.
    if (row.quoteId) {
      byQuoteId.set(row.quoteId, row);
    }
  }

  return byQuoteId;
}

export function buildQuoteListWhere(input: QuoteListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.statuses.length > 0) {
    conditions.push(inArray(quotes.status, input.filters.statuses));
  } else {
    conditions.push(ne(quotes.status, 'cancelled'));
  }

  if (input.filters.customerId) {
    conditions.push(eq(quotes.customerId, input.filters.customerId));
  }

  if (input.filters.invoiced) {
    conditions.push(
      input.filters.invoiced === 'invoiced' ? isNotNull(quotes.invoiceNumber) : isNull(quotes.invoiceNumber),
    );
  }

  if (input.filters.kind) {
    conditions.push(eq(quotes.kind, input.filters.kind));
  }

  if (input.filters.productId) {
    conditions.push(eq(quotes.productId, input.filters.productId));
  }

  if (input.filters.quoteCode) {
    const quoteCode = parseQuoteCodeNumber(input.filters.quoteCode);

    if (quoteCode !== undefined) {
      conditions.push(eq(quotes.code, quoteCode));
    }
  }

  if (input.filters.salesPersonId) {
    conditions.push(eq(quotes.salesPersonId, input.filters.salesPersonId));
  }

  if (input.search) {
    const codeSearch = parseQuoteCodeNumber(input.search);
    const jobCodeSearch = parseJobCodeSearch(input.search);
    const globalSearchWhere = or(
      createGlobalSearchCondition(input.search, [
        sql`${quotes.id}::text`,
        sql`${quotes.code}::text`,
        sql`${customers.companyName}`,
        sql`${quotes.invoiceNumber}`,
        sql`${quotes.workTitle}`,
        sql`${products.name}`,
        sql`${products.modelCode}`,
      ]),
      codeSearch === undefined ? undefined : eq(quotes.code, codeSearch),
      sql`exists (
        select 1
        from ${jobs}
        where ${jobs.quoteId} = ${quotes.id}
          and ${jobs.cancelledAt} is null
          and ${
            jobCodeSearch === undefined
              ? createGlobalSearchCondition(input.search, [sql`${jobs.code}::text`])
              : or(createGlobalSearchCondition(input.search, [sql`${jobs.code}::text`]), eq(jobs.code, jobCodeSearch))
          }
      )`,
    );

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function getQuoteSortColumn(sortBy: QuoteSortBy): SQL {
  const columns = {
    code: sql`${quotes.code}`,
    createdAt: sql`${quotes.createdAt}`,
    customerCompanyName: sql`${customers.companyName}`,
    // Sorted as blank rather than null so an uninvoiced Quote sorts alongside the other empty values.
    invoiceNumber: sql`coalesce(${quotes.invoiceNumber}, '')`,
    productName: sql`coalesce(${products.name}, ${quotes.workTitle}, '')`,
    salesPersonName: sql`${user.name}`,
    status: sql`${quotes.status}`,
  } as const satisfies Record<QuoteSortBy, SQL>;

  return columns[sortBy];
}

export function getEarliestDeliveryDateExpression(): SQL<string> {
  return sql<string>`
    case
      when ${quotes.preferredDeliveryDate} is null then ${quotes.plannedDeliveryDate}
      when ${quotes.plannedDeliveryDate} is null then ${quotes.preferredDeliveryDate}
      when ${quotes.preferredDeliveryDate} <= ${quotes.plannedDeliveryDate} then ${quotes.preferredDeliveryDate}
      else ${quotes.plannedDeliveryDate}
    end
  `;
}

export function getPriorityQuoteWindowEndDate(now: Date): DateOnlyIso {
  const currentPlantDate = parseDateOnlyParts(toPlantDateOnly(now));
  const targetMonthIndex = currentPlantDate.month - 1 + PRIORITY_QUOTE_WINDOW_MONTHS;
  const targetYear = currentPlantDate.year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(currentPlantDate.day, lastDayOfTargetMonth);

  return toDateOnlyParts({ day: targetDay, month: targetMonth, year: targetYear });
}

export function toDateOnlyParts({ day, month, year }: { day: number; month: number; year: number }): DateOnlyIso {
  return DateOnlyIso.parse(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
