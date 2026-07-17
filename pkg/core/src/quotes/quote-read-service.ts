import {
  createGlobalSearchCondition,
  customers,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  jobs,
  products,
  quoteLineItems,
  quoteSelectedAssemblies,
  quotes,
  user,
  withPagination,
} from '@pkg/db';
import { addDateOnlyDays, parseDateOnlyParts, parseJobCodeSearch, toPlantDateOnly } from '@pkg/domain';
import {
  DateOnlyIso,
  type PriorityQuote,
  parseQuoteCodeNumber,
  type QuoteDetail,
  type QuoteListInput,
  type QuoteListResult,
  type QuoteProductBayAvailabilityInput,
  QuoteProductBayAvailabilityResult,
  type QuoteSortBy,
  UpcomingDeliveryQuotesResult,
  type UserListResult,
  UserSummary,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray, ne, or, type SQL, sql } from 'drizzle-orm';

import { listBayQueueAvailability } from '../jobs/job-read-service.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { listProductBays } from '../products/product-service.js';
import {
  QuoteInvalidReferenceError,
  QuoteNotFoundError,
  QuoteProductBayAvailabilityNotApplicableError,
} from './quote-errors.js';
import { getLineItemsByQuoteId, type QuoteLineItemRow } from './quote-line-items.js';
import {
  mapPriorityQuote,
  mapQuoteDetail,
  mapQuoteSummary,
  mapUpcomingDeliveryQuote,
  type QuoteLinkedJobRow,
} from './quote-mappers.js';
import { narrowQuoteOffering } from './quote-offering.js';
import { getSelectedAssembliesByQuoteId, type QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

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
  const { jobByQuoteId, lineItemsByQuoteId, selectedAssembliesByQuoteId } = await loadQuoteAssociations({
    db,
    includeJobs: true,
    quoteIds: rows.map((row) => row.quote.id),
  });

  return {
    items: rows.map((row) =>
      mapQuoteSummary(
        row,
        jobByQuoteId.get(row.quote.id) ?? null,
        lineItemsByQuoteId.get(row.quote.id) ?? [],
        selectedAssembliesByQuoteId.get(row.quote.id) ?? [],
      ),
    ),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    total: Number(totalRow?.count ?? 0),
  };
}

export async function listPriorityQuotes({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
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
        sql`${earliestDeliveryDate} is not null`,
        sql`${earliestDeliveryDate} <= ${priorityWindowEndDate}::date`,
        sql`not exists (
          select 1
          from ${jobs}
          where ${jobs.quoteId} = ${quotes.id}
        )`,
      ),
    )
    .orderBy(asc(earliestDeliveryDate), asc(quotes.code), asc(quotes.id));

  const { jobByQuoteId, lineItemsByQuoteId, selectedAssembliesByQuoteId } = await loadQuoteAssociations({
    db,
    includeJobs: true,
    quoteIds: rows.map((row) => row.quote.id),
  });

  return rows.map((row) =>
    mapPriorityQuote(
      row,
      jobByQuoteId.get(row.quote.id) ?? null,
      lineItemsByQuoteId.get(row.quote.id) ?? [],
      selectedAssembliesByQuoteId.get(row.quote.id) ?? [],
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

  const { jobByQuoteId, lineItemsByQuoteId, selectedAssembliesByQuoteId } = await loadQuoteAssociations({
    db,
    includeJobs: true,
    quoteIds: rows.map((row) => row.quote.id),
  });

  return UpcomingDeliveryQuotesResult.parse({
    items: rows.map((row) =>
      mapUpcomingDeliveryQuote(
        row,
        jobByQuoteId.get(row.quote.id) ?? null,
        lineItemsByQuoteId.get(row.quote.id) ?? [],
        selectedAssembliesByQuoteId.get(row.quote.id) ?? [],
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
          code: true,
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
      salesPerson: {
        columns: {
          email: true,
          image: true,
          name: true,
        },
      },
      lineItems: {
        orderBy: [asc(quoteLineItems.position), asc(quoteLineItems.createdAt), asc(quoteLineItems.id)],
      },
      selectedAssemblies: {
        orderBy: [asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id)],
      },
    },
  });

  if (!row) {
    throw new QuoteNotFoundError(id);
  }

  const offering = narrowQuoteOffering(row);
  const [assemblies, productBaysForQuote] = await Promise.all([
    offering.kind === 'product' ? listAssemblies({ tx: db, productId: offering.productId }) : Promise.resolve([]),
    offering.kind === 'product' ? listProductBays({ db, productId: offering.productId }) : Promise.resolve([]),
  ]);

  return mapQuoteDetail(row, assemblies, productBaysForQuote);
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
    where: inArray(user.role, ['super-admin', 'admin', 'sales']),
    orderBy: [asc(user.name), asc(user.id)],
  });

  return {
    users: rows.map((row) =>
      UserSummary.parse({
        assistantEnabled: row.assistantEnabled,
        departments: [],
        email: row.email,
        emailVerified: row.emailVerified,
        id: row.id,
        name: row.name,
        phoneNumber: row.phoneNumber,
        role: row.role,
        thumbnailDataUrl: row.image,
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
  lineItemsByQuoteId: Map<UUID, QuoteLineItemRow[]>;
  selectedAssembliesByQuoteId: Map<UUID, QuoteSelectedAssemblyRow[]>;
}> {
  const [lineItemsByQuoteId, selectedAssembliesByQuoteId, jobByQuoteId] = await Promise.all([
    getLineItemsByQuoteId({ db, quoteIds }),
    getSelectedAssembliesByQuoteId({ db, quoteIds }),
    includeJobs ? getJobByQuoteId({ db, quoteIds }) : Promise.resolve(new Map<UUID, QuoteLinkedJobRow>()),
  ]);

  return { jobByQuoteId, lineItemsByQuoteId, selectedAssembliesByQuoteId };
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
      jobId: jobs.id,
      quoteId: jobs.quoteId,
    })
    .from(jobs)
    .where(inArray(jobs.quoteId, quoteIds));
  const byQuoteId = new Map<UUID, QuoteLinkedJobRow>();

  for (const row of rows) {
    byQuoteId.set(row.quoteId, row);
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
        sql`${quotes.workTitle}`,
        sql`${products.name}`,
        sql`${products.modelCode}`,
      ]),
      codeSearch === undefined ? undefined : eq(quotes.code, codeSearch),
      sql`exists (
        select 1
        from ${jobs}
        where ${jobs.quoteId} = ${quotes.id}
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
