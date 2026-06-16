import {
  createGlobalSearchCondition,
  customers,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  jobs,
  products,
  quoteSelectedAssemblies,
  quotes,
  user,
  withPagination,
} from '@pkg/db';
import {
  addDateOnlyDays,
  assertQuoteEditable,
  parseDateOnlyParts,
  parseJobCodeSearch,
  toPlantDateOnly,
  validateDiscount,
} from '@pkg/domain';
import {
  type Assembly,
  type AuthId,
  DateOnlyIso,
  formatQuoteCode,
  JobCode,
  type PriorityQuote,
  type ProductBay,
  ProductCurrencyCode,
  Quote,
  QuoteCode,
  type QuoteCreateInput,
  type QuoteDetail,
  type QuoteListInput,
  type QuoteListResult,
  type QuoteProductBayAvailabilityInput,
  QuoteProductBayAvailabilityResult,
  type QuoteSortBy,
  type QuoteSummary,
  type QuoteUpdateInput,
  type UpcomingDeliveryQuote,
  UpcomingDeliveryQuotesResult,
  type UserListResult,
  UserSummary,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { customerAuditDescriptor } from '../customers/customer-service.js';
import { listBayQueueAvailability } from '../jobs/job-read-service.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { getProduct, listProductBays } from '../products/product-service.js';
import {
  QuoteDiscountInvalidError,
  QuoteInvalidReferenceError,
  QuoteLockedError,
  QuoteNotFoundError,
} from './quote-errors.js';
import {
  getSelectedAssembliesByQuoteId,
  listQuoteSelectedAssemblies,
  mapQuoteSelectedAssembly,
  persistQuoteSelectedAssemblies,
  type QuoteSelectedAssemblyRow,
  resolveQuoteSelectedAssemblies,
} from './quote-selected-assemblies.js';

type QuoteRow = typeof quotes.$inferSelect;
type QuoteAuditInput = { row: QuoteRow; selectedAssemblies: readonly QuoteSelectedAssemblyRow[] };

const PRIORITY_QUOTE_WINDOW_MONTHS = 2;
const UPCOMING_DELIVERY_WINDOW_DAYS = 30;

// `code` is the summary label, not an audited field, so it lives in `label`. `selectedAssemblies` is
// folded into one stable JSON field — the Quote Selected Assembly snapshot the audit log diffs against.
export const quoteAuditDescriptor = defineAuditDescriptor<QuoteAuditInput>({
  entityType: 'quote',
  noun: 'quote',
  primaryLabelField: 'code',
  primaryLabelFormatter: formatQuoteAuditLabel,
  entityId: ({ row }) => row.id,
  label: ({ row }) => row.code,
  toRecord: ({ row, selectedAssemblies }) => ({
    customerId: row.customerId,
    depositPercent: row.depositPercent,
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountPercent: row.discountPercent,
    notes: row.notes,
    documentNotes: row.documentNotes,
    plannedDeliveryDate: row.plannedDeliveryDate,
    preferredDeliveryDate: row.preferredDeliveryDate,
    productId: row.productId,
    quotedBasePrice: row.quotedBasePrice,
    quotedCurrencyCode: row.quotedCurrencyCode,
    salesPersonId: row.salesPersonId,
    selectedAssemblies: JSON.stringify(toQuoteSelectedAssemblyAuditRecord(selectedAssemblies)),
    status: row.status,
    validUntil: row.validUntil,
  }),
});

function formatQuoteAuditLabel(value: unknown): string {
  if (typeof value === 'number') {
    return formatQuoteCode(value);
  }

  const result = QuoteCode.safeParse(value);

  return result.success ? result.data : String(value);
}

type QuoteListRow = {
  quote: QuoteRow;
  customerCompanyName: string;
  customerThumbnailDataUrl: string | null;
  productBuildTimeDays: number;
  productCurrencyCode: string;
  productModelCode: string;
  productName: string;
  salesPersonEmail: string | null;
  salesPersonName: string | null;
  salesPersonThumbnailDataUrl: string | null;
};

type QuoteLinkedJobRow = {
  jobCode: number;
  jobId: string;
  quoteId: string | null;
};

type PriorityQuoteRow = QuoteListRow & {
  earliestDeliveryDate: string;
};

type QuoteDetailRow = QuoteRow & {
  customer: Pick<
    typeof customers.$inferSelect,
    'address' | 'companyName' | 'contactPerson' | 'email' | 'phone' | 'thumbnailDataUrl' | 'vatNumber'
  >;
  jobs: Pick<typeof jobs.$inferSelect, 'code' | 'id'>[];
  product: Pick<
    typeof products.$inferSelect,
    'buildTimeDays' | 'currencyCode' | 'description' | 'modelCode' | 'name' | 'requiresVinNumber' | 'thumbnailDataUrl'
  >;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'image' | 'name'> | null;
  selectedAssemblies: QuoteSelectedAssemblyRow[];
};

export function mapQuote(row: QuoteRow): Quote {
  return Quote.parse({
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    customerId: row.customerId,
    depositPercent: row.depositPercent,
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountPercent: row.discountPercent,
    id: row.id,
    notes: row.notes,
    documentNotes: row.documentNotes,
    plannedDeliveryDate: row.plannedDeliveryDate,
    preferredDeliveryDate: row.preferredDeliveryDate,
    productId: row.productId,
    quotedBasePrice: row.quotedBasePrice,
    quotedCurrencyCode: row.quotedCurrencyCode,
    salesPersonId: row.salesPersonId,
    status: row.status,
    statusChangedAt: row.statusChangedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    validUntil: row.validUntil,
  });
}

export async function createQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteCreateInput;
}): Promise<QuoteDetail> {
  return db.transaction(async (tx) => {
    const customerId = await resolveQuoteCustomer({ actorUserId, input, tx });
    const product = await getProduct({ db, id: input.productId });
    assertValidDiscount({ discountPercent: input.discountPercent });
    await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });

    const [row] = await tx
      .insert(quotes)
      .values({
        customerId,
        depositPercent: input.depositPercent,
        deliveryIncluded: input.deliveryIncluded,
        deliveryPrice: input.deliveryIncluded ? input.deliveryPrice : 0,
        discountPercent: input.discountPercent,
        notes: input.notes,
        documentNotes: input.documentNotes,
        plannedDeliveryDate: input.plannedDeliveryDate,
        preferredDeliveryDate: input.preferredDeliveryDate,
        productId: input.productId,
        quotedBasePrice: product.basePrice,
        quotedCurrencyCode: product.currencyCode,
        salesPersonId: input.salesPersonId,
        status: input.status,
        validUntil: input.validUntil,
      })
      .returning();

    if (!row) {
      throw new Error('Quote insert did not return a row');
    }

    const resolved = await resolveQuoteSelectedAssemblies({
      input,
      productId: row.productId,
      quoteId: row.id,
      tx,
    });
    const selectedAssemblies = await persistQuoteSelectedAssemblies({ quoteId: row.id, resolved, tx });

    await recordAuditCreate({
      db: tx,
      descriptor: quoteAuditDescriptor,
      actorUserId,
      input: { row, selectedAssemblies },
    });

    return getQuote({ db: tx, id: row.id });
  });
}

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
      .innerJoin(products, eq(quotes.productId, products.id))
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
    .innerJoin(products, eq(quotes.productId, products.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([rowsQuery, totalQuery]);
  const quoteIds = rows.map((row) => row.quote.id);
  const [selectedAssembliesByQuoteId, jobByQuoteId] = await Promise.all([
    getSelectedAssembliesByQuoteId({ db, quoteIds }),
    getJobByQuoteId({ db, quoteIds }),
  ]);

  return {
    items: rows.map((row) =>
      mapQuoteSummary(row, jobByQuoteId.get(row.quote.id) ?? null, selectedAssembliesByQuoteId.get(row.quote.id) ?? []),
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
    .innerJoin(products, eq(quotes.productId, products.id))
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

  const quoteIds = rows.map((row) => row.quote.id);
  const [selectedAssembliesByQuoteId, jobByQuoteId] = await Promise.all([
    getSelectedAssembliesByQuoteId({ db, quoteIds }),
    getJobByQuoteId({ db, quoteIds }),
  ]);

  return rows.map((row) =>
    mapPriorityQuote(row, jobByQuoteId.get(row.quote.id) ?? null, selectedAssembliesByQuoteId.get(row.quote.id) ?? []),
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
    .innerJoin(products, eq(quotes.productId, products.id))
    .leftJoin(user, eq(quotes.salesPersonId, user.id))
    .where(
      and(
        eq(quotes.status, 'accepted'),
        sql`${quotes.plannedDeliveryDate} is not null`,
        sql`${quotes.plannedDeliveryDate} <= ${windowEndDate}::date`,
      ),
    )
    .orderBy(asc(quotes.plannedDeliveryDate), asc(quotes.code), asc(quotes.id));

  const quoteIds = rows.map((row) => row.quote.id);
  const [selectedAssembliesByQuoteId, jobByQuoteId] = await Promise.all([
    getSelectedAssembliesByQuoteId({ db, quoteIds }),
    getJobByQuoteId({ db, quoteIds }),
  ]);

  return UpcomingDeliveryQuotesResult.parse({
    items: rows.map((row) =>
      mapUpcomingDeliveryQuote(
        row,
        jobByQuoteId.get(row.quote.id) ?? null,
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
      selectedAssemblies: {
        orderBy: [asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id)],
      },
    },
  });

  if (!row) {
    throw new QuoteNotFoundError(id);
  }

  const [assemblies, productBaysForQuote] = await Promise.all([
    listAssemblies({ tx: db, productId: row.productId }),
    listProductBays({ db, productId: row.productId }),
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
    buildTimeDays: quote.productBuildTimeDays,
    defaultLeadTimeWorkingDays: quote.productBuildTimeDays + maxBayWaitWorkingDays,
    maxBayWaitWorkingDays,
  });
}

export async function listQuoteSalespeople({ db }: { db: Db }): Promise<UserListResult> {
  const rows = await db.query.user.findMany({
    where: inArray(user.role, ['admin', 'sales']),
    orderBy: [asc(user.name), asc(user.id)],
  });

  return {
    users: rows.map((row) =>
      UserSummary.parse({
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

export async function updateQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteUpdateInput;
}): Promise<QuoteDetail> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, input.id)).for('update');

    if (!before) {
      throw new QuoteNotFoundError(input.id);
    }

    const beforeSelectedAssemblies = await listQuoteSelectedAssemblies({ quoteId: before.id, tx });

    assertValidDiscount({ discountPercent: input.discountPercent });

    await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });

    const patch = {
      customerId: before.customerId,
      depositPercent: input.depositPercent,
      deliveryIncluded: input.deliveryIncluded,
      deliveryPrice: input.deliveryIncluded ? input.deliveryPrice : 0,
      discountPercent: input.discountPercent,
      notes: input.notes,
      documentNotes: input.documentNotes,
      plannedDeliveryDate: input.plannedDeliveryDate,
      preferredDeliveryDate: input.preferredDeliveryDate,
      productId: before.productId,
      quotedBasePrice: before.quotedBasePrice,
      quotedCurrencyCode: before.quotedCurrencyCode,
      salesPersonId: input.salesPersonId,
      status: input.status,
      validUntil: input.validUntil,
    };
    const after = { ...before, ...patch };
    const resolved = await resolveQuoteSelectedAssemblies({
      currentRows: beforeSelectedAssemblies,
      input,
      productId: before.productId,
      quoteId: before.id,
      tx,
    });
    const changes = diffAuditUpdate(
      quoteAuditDescriptor,
      { row: before, selectedAssemblies: beforeSelectedAssemblies },
      { row: after, selectedAssemblies: resolved.rows },
    );

    if (!changes) {
      return getQuote({ db: tx, id: before.id });
    }

    const editable = assertQuoteEditable({
      changedFields: Object.keys(changes),
      hasJob: await quoteHasJob({ quoteId: before.id, tx }),
    });

    if (!editable.allowed) {
      throw new QuoteLockedError(editable.reason);
    }

    const [row] = await tx
      .update(quotes)
      .set({
        ...patch,
        updatedAt: new Date(),
        ...(input.status === before.status ? {} : { statusChangedAt: new Date() }),
      })
      .where(eq(quotes.id, input.id))
      .returning();

    if (!row) {
      throw new QuoteNotFoundError(input.id);
    }

    const selectedAssemblies = await persistQuoteSelectedAssemblies({ quoteId: row.id, resolved, tx });

    await recordAuditUpdate({
      db: tx,
      descriptor: quoteAuditDescriptor,
      actorUserId,
      after: { row, selectedAssemblies },
      changes,
    });

    return getQuote({ db: tx, id: row.id });
  });
}

function mapQuoteSummary(
  row: QuoteListRow,
  job: QuoteLinkedJobRow | null,
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): QuoteSummary {
  return {
    ...mapQuote(row.quote),
    customerCompanyName: row.customerCompanyName,
    customerThumbnailDataUrl: row.customerThumbnailDataUrl,
    job: job ? mapQuoteLinkedJob(job) : null,
    productBuildTimeDays: row.productBuildTimeDays,
    productCurrencyCode: ProductCurrencyCode.parse(row.productCurrencyCode),
    productModelCode: row.productModelCode,
    productName: row.productName,
    salesPersonEmail: row.salesPersonEmail,
    salesPersonName: row.salesPersonName,
    salesPersonThumbnailDataUrl: row.salesPersonThumbnailDataUrl,
    selectedAssemblies: selectedAssemblies.map(mapQuoteSelectedAssembly),
  };
}

function mapPriorityQuote(
  row: PriorityQuoteRow,
  job: QuoteLinkedJobRow | null,
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): PriorityQuote {
  return {
    ...mapQuoteSummary(row, job, selectedAssemblies),
    earliestDeliveryDate: DateOnlyIso.parse(row.earliestDeliveryDate),
  };
}

function mapUpcomingDeliveryQuote(
  row: QuoteListRow,
  job: QuoteLinkedJobRow | null,
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): UpcomingDeliveryQuote {
  const summary = mapQuoteSummary(row, job, selectedAssemblies);

  return {
    ...summary,
    plannedDeliveryDate: DateOnlyIso.parse(row.quote.plannedDeliveryDate),
  };
}

function mapQuoteDetail(
  row: QuoteDetailRow,
  productAssembliesForQuote: Assembly[],
  productBaysForQuote: ProductBay[],
): QuoteDetail {
  return {
    ...mapQuote(row),
    customerAddress: row.customer.address,
    customerCompanyName: row.customer.companyName,
    customerContactPerson: row.customer.contactPerson,
    customerEmail: row.customer.email,
    customerPhone: row.customer.phone,
    customerThumbnailDataUrl: row.customer.thumbnailDataUrl,
    customerVatNumber: row.customer.vatNumber,
    job: row.jobs[0] ? mapQuoteLinkedJob({ jobCode: row.jobs[0].code, jobId: row.jobs[0].id }) : null,
    productCurrencyCode: ProductCurrencyCode.parse(row.product.currencyCode),
    productBuildTimeDays: row.product.buildTimeDays,
    productDescription: row.product.description,
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    productAssemblies: productAssembliesForQuote,
    productBays: productBaysForQuote,
    productRequiresVinNumber: row.product.requiresVinNumber,
    productThumbnailDataUrl: row.product.thumbnailDataUrl,
    salesPersonEmail: row.salesPerson?.email ?? null,
    salesPersonName: row.salesPerson?.name ?? null,
    salesPersonThumbnailDataUrl: row.salesPerson?.image ?? null,
    selectedAssemblies: row.selectedAssemblies.map(mapQuoteSelectedAssembly),
  };
}

function mapQuoteLinkedJob(job: Pick<QuoteLinkedJobRow, 'jobCode' | 'jobId'>) {
  return {
    jobCode: JobCode.parse(job.jobCode),
    jobId: job.jobId,
  };
}

async function getJobByQuoteId({
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

async function resolveQuoteCustomer({
  actorUserId,
  input,
  tx,
}: {
  actorUserId: AuthId;
  input: Pick<QuoteCreateInput, 'customer'>;
  tx: DatabaseTransaction;
}): Promise<UUID> {
  if (input.customer.type === 'existing') {
    await assertQuoteCustomer({ customerId: input.customer.customerId, tx });
    return input.customer.customerId;
  }

  const [customer] = await tx
    .insert(customers)
    .values({
      companyName: input.customer.companyName,
      email: null,
    })
    .returning();

  if (!customer) {
    throw new Error('Inline customer insert did not return a row');
  }

  await recordAuditCreate({ db: tx, descriptor: customerAuditDescriptor, actorUserId, input: customer });

  return customer.id;
}

async function assertQuoteCustomer({ customerId, tx }: { customerId: UUID; tx: DatabaseTransaction }): Promise<void> {
  const [customer] = await tx
    .select({
      id: customers.id,
    })
    .from(customers)
    .where(eq(customers.id, customerId));

  if (!customer) {
    throw new QuoteInvalidReferenceError('Quote customer was not found.');
  }
}

async function assertQuoteSalesPerson({
  salesPersonId,
  tx,
}: {
  salesPersonId: AuthId;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [salesPerson] = await tx
    .select({
      id: user.id,
    })
    .from(user)
    .where(and(eq(user.id, salesPersonId), inArray(user.role, ['admin', 'sales'])));

  if (!salesPerson) {
    throw new QuoteInvalidReferenceError('Quote salesperson must be a sales or admin user.');
  }
}

function assertValidDiscount({ discountPercent }: { discountPercent: number }): void {
  const result = validateDiscount({ discountPercent });

  if (!result.allowed) {
    throw new QuoteDiscountInvalidError(result.reason);
  }
}

function toQuoteSelectedAssemblyAuditRecord(selectedAssemblies: readonly QuoteSelectedAssemblyRow[]) {
  return selectedAssemblies
    .map((selection) => ({
      productAssemblyId: selection.productAssemblyId,
      quotedName: selection.quotedName,
      quotedPrice: selection.quotedPrice,
    }))
    .toSorted(
      (left, right) =>
        left.quotedName.localeCompare(right.quotedName) ||
        (left.productAssemblyId ?? '').localeCompare(right.productAssemblyId ?? ''),
    );
}

async function quoteHasJob({ quoteId, tx }: { quoteId: UUID; tx: DatabaseTransaction }): Promise<boolean> {
  const [job] = await tx
    .select({
      id: jobs.id,
    })
    .from(jobs)
    .where(eq(jobs.quoteId, quoteId))
    .limit(1);

  return Boolean(job);
}

function buildQuoteListWhere(input: QuoteListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.statuses.length > 0) {
    conditions.push(inArray(quotes.status, input.filters.statuses));
  }

  if (input.filters.customerId) {
    conditions.push(eq(quotes.customerId, input.filters.customerId));
  }

  if (input.filters.productId) {
    conditions.push(eq(quotes.productId, input.filters.productId));
  }

  if (input.filters.salesPersonId) {
    conditions.push(eq(quotes.salesPersonId, input.filters.salesPersonId));
  }

  if (input.search) {
    const codeSearch = parseQuoteCodeSearch(input.search);
    const jobCodeSearch = parseJobCodeSearch(input.search);
    const globalSearchWhere = or(
      createGlobalSearchCondition(input.search, [
        sql`${quotes.id}::text`,
        sql`${quotes.code}::text`,
        sql`${customers.companyName}`,
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

function getQuoteSortColumn(sortBy: QuoteSortBy): SQL {
  const columns = {
    code: sql`${quotes.code}`,
    createdAt: sql`${quotes.createdAt}`,
    customerCompanyName: sql`${customers.companyName}`,
    productName: sql`${products.name}`,
    salesPersonName: sql`${user.name}`,
    status: sql`${quotes.status}`,
  } as const satisfies Record<QuoteSortBy, SQL>;

  return columns[sortBy];
}

function getEarliestDeliveryDateExpression(): SQL<string> {
  return sql<string>`
    case
      when ${quotes.preferredDeliveryDate} is null then ${quotes.plannedDeliveryDate}
      when ${quotes.plannedDeliveryDate} is null then ${quotes.preferredDeliveryDate}
      when ${quotes.preferredDeliveryDate} <= ${quotes.plannedDeliveryDate} then ${quotes.preferredDeliveryDate}
      else ${quotes.plannedDeliveryDate}
    end
  `;
}

function getPriorityQuoteWindowEndDate(now: Date): DateOnlyIso {
  const currentPlantDate = parseDateOnlyParts(toPlantDateOnly(now));
  const targetMonthIndex = currentPlantDate.month - 1 + PRIORITY_QUOTE_WINDOW_MONTHS;
  const targetYear = currentPlantDate.year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(currentPlantDate.day, lastDayOfTargetMonth);

  return toDateOnlyParts({ day: targetDay, month: targetMonth, year: targetYear });
}

function parseQuoteCodeSearch(search: string): number | undefined {
  const normalized = search.trim().replace(/^QUO-/i, '');

  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const code = Number.parseInt(normalized, 10);

  return Number.isSafeInteger(code) && code > 0 ? code : undefined;
}

function toDateOnlyParts({ day, month, year }: { day: number; month: number; year: number }): DateOnlyIso {
  return DateOnlyIso.parse(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
