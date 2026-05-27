import {
  createGlobalSearchCondition,
  customers,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  jobs,
  products,
  quotes,
  user,
  withPagination,
} from '@pkg/db';
import { computeQuoteTotal, evaluateQuoteTransition, parseJobCodeSearch, validateDiscount } from '@pkg/domain';
import {
  type AuthId,
  JobCode,
  ProductCurrencyCode,
  Quote,
  type QuoteCreateInput,
  type QuoteDecisionInput,
  type QuoteDetail,
  type QuoteListInput,
  type QuoteListResult,
  type QuoteSendInput,
  type QuoteSortBy,
  type QuoteStatus,
  type QuoteSummary,
  type QuoteUpdateInput,
  type UserListResult,
  UserSummary,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';

import {
  createAuditChanges,
  customerAuditDescriptor,
  insertAuditEvent,
  quoteAuditDescriptor,
} from '../audit/audit-service.js';
import {
  QuoteDiscountInvalidError,
  QuoteFrozenError,
  QuoteInvalidReferenceError,
  QuoteNotFoundError,
  QuoteTransitionDeniedError,
} from './quote-errors.js';

type QuoteRow = typeof quotes.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type QuoteAuditRecord = Pick<
  QuoteRow,
  | 'code'
  | 'customerId'
  | 'discount'
  | 'notes'
  | 'productId'
  | 'quotedBasePrice'
  | 'quotedCurrencyCode'
  | 'salesPersonId'
  | 'sentAt'
  | 'status'
  | 'validUntil'
>;
type QuoteListRow = {
  quote: QuoteRow;
  customerCompanyName: string;
  productBasePrice: number | null;
  productCurrencyCode: string | null;
  productModelCode: string | null;
  productName: string | null;
  salesPersonEmail: string | null;
  salesPersonName: string | null;
};
type QuoteLinkedJobRow = {
  jobCode: number;
  jobId: string;
  quoteId: string | null;
};
type QuoteDetailRow = QuoteRow & {
  customer: Pick<typeof customers.$inferSelect, 'companyName'>;
  jobs: Pick<typeof jobs.$inferSelect, 'code' | 'id'>[];
  product: Pick<typeof products.$inferSelect, 'basePrice' | 'currencyCode' | 'modelCode' | 'name'> | null;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'name'> | null;
};

export function mapQuote(row: QuoteRow): Quote {
  return Quote.parse({
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    customerId: row.customerId,
    discount: row.discount,
    id: row.id,
    notes: row.notes,
    productId: row.productId,
    quotedBasePrice: row.quotedBasePrice,
    quotedCurrencyCode: row.quotedCurrencyCode,
    salesPersonId: row.salesPersonId,
    sentAt: row.sentAt?.toISOString() ?? null,
    status: row.status,
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
    if (input.productId) {
      const product = await readProductForQuote({ productId: input.productId, tx });
      assertValidDiscount({ basePrice: product.basePrice, discount: input.discount });
    } else {
      assertDraftWithoutProductHasNoDiscount(input.discount);
    }

    if (input.salesPersonId) {
      await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });
    }

    const [row] = await tx
      .insert(quotes)
      .values({
        customerId,
        discount: input.discount,
        notes: input.notes,
        productId: input.productId,
        salesPersonId: input.salesPersonId,
        validUntil: input.validUntil,
      })
      .returning();

    if (!row) {
      throw new Error('Quote insert did not return a row');
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'created',
        actorUserId,
        after: mapQuoteAuditRecord(row),
        before: null,
        changes: null,
        entityId: row.id,
        entityType: quoteAuditDescriptor.entityType,
      },
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
        productBasePrice: products.basePrice,
        productCurrencyCode: products.currencyCode,
        productModelCode: products.modelCode,
        productName: products.name,
        salesPersonEmail: user.email,
        salesPersonName: user.name,
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

  const [totalRow] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(products, eq(quotes.productId, products.id))
    .where(where);

  const rows = await rowsQuery;
  const linkedJobsByQuoteId = await getLinkedJobsByQuoteId({
    db,
    quoteIds: rows.map((row) => row.quote.id),
  });

  return {
    items: rows.map((row) => mapQuoteSummary(row, linkedJobsByQuoteId.get(row.quote.id) ?? [])),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    total: Number(totalRow?.count ?? 0),
  };
}

export async function getQuote({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<QuoteDetail> {
  const row = await db.query.quotes.findFirst({
    where: eq(quotes.id, id),
    with: {
      customer: {
        columns: {
          companyName: true,
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
          basePrice: true,
          currencyCode: true,
          modelCode: true,
          name: true,
        },
      },
      salesPerson: {
        columns: {
          email: true,
          name: true,
        },
      },
    },
  });

  if (!row) {
    throw new QuoteNotFoundError(id);
  }

  return mapQuoteDetail(row);
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
        role: row.role,
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

    if (before.status !== 'draft') {
      throw new QuoteFrozenError(input.id);
    }

    const customerId = await resolveQuoteCustomer({ actorUserId, input, tx });
    if (input.productId) {
      const product = await readProductForQuote({ productId: input.productId, tx });
      assertValidDiscount({ basePrice: product.basePrice, discount: input.discount });
    } else {
      assertDraftWithoutProductHasNoDiscount(input.discount);
    }

    if (input.salesPersonId) {
      await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });
    }

    const after = {
      ...before,
      customerId,
      discount: input.discount,
      notes: input.notes,
      productId: input.productId,
      salesPersonId: input.salesPersonId,
      validUntil: input.validUntil,
    };
    const changes = createAuditChanges(
      mapQuoteAuditRecord(before),
      mapQuoteAuditRecord(after),
      quoteAuditDescriptor.fields,
    );

    if (!changes) {
      return getQuote({ db: tx, id: before.id });
    }

    const [row] = await tx
      .update(quotes)
      .set({
        customerId,
        discount: input.discount,
        notes: input.notes,
        productId: input.productId,
        salesPersonId: input.salesPersonId,
        updatedAt: new Date(),
        validUntil: input.validUntil,
      })
      .where(eq(quotes.id, input.id))
      .returning();

    if (!row) {
      throw new QuoteNotFoundError(input.id);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after: mapQuoteAuditRecord(row),
        before: mapQuoteAuditRecord(before),
        changes,
        entityId: row.id,
        entityType: quoteAuditDescriptor.entityType,
      },
    });

    return getQuote({ db: tx, id: row.id });
  });
}

export async function sendQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteSendInput;
}): Promise<QuoteDetail> {
  return transitionQuote({
    actorUserId,
    db,
    id: input.id,
    nextStatus: 'sent',
    transition: 'send',
  });
}

export async function acceptQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteDecisionInput;
}): Promise<QuoteDetail> {
  return transitionQuote({
    actorUserId,
    db,
    id: input.id,
    nextStatus: 'accepted',
    transition: 'accept',
  });
}

export async function rejectQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteDecisionInput;
}): Promise<QuoteDetail> {
  return transitionQuote({
    actorUserId,
    db,
    id: input.id,
    nextStatus: 'rejected',
    transition: 'reject',
  });
}

function mapQuoteSummary(row: QuoteListRow, linkedJobs: readonly QuoteLinkedJobRow[]): QuoteSummary {
  const quotedBasePrice = row.quote.quotedBasePrice ?? row.productBasePrice;

  return {
    ...mapQuote(row.quote),
    customerCompanyName: row.customerCompanyName,
    linkedJobs: linkedJobs.map((job) => ({
      jobCode: JobCode.parse(job.jobCode),
      jobId: job.jobId,
    })),
    productCurrencyCode: row.productCurrencyCode === null ? null : ProductCurrencyCode.parse(row.productCurrencyCode),
    productModelCode: row.productModelCode,
    productName: row.productName,
    salesPersonEmail: row.salesPersonEmail,
    salesPersonName: row.salesPersonName,
    total: quotedBasePrice === null ? null : computeQuoteTotal({ discount: row.quote.discount, quotedBasePrice }),
  };
}

function mapQuoteDetail(row: QuoteDetailRow): QuoteDetail {
  const quotedBasePrice = row.quotedBasePrice ?? row.product?.basePrice ?? null;

  return {
    ...mapQuote(row),
    customerCompanyName: row.customer.companyName,
    linkedJobs: row.jobs.map((job) => ({
      jobCode: JobCode.parse(job.code),
      jobId: job.id,
    })),
    productCurrencyCode: row.product?.currencyCode ? ProductCurrencyCode.parse(row.product.currencyCode) : null,
    productModelCode: row.product?.modelCode ?? null,
    productName: row.product?.name ?? null,
    salesPersonEmail: row.salesPerson?.email ?? null,
    salesPersonName: row.salesPerson?.name ?? null,
    total: quotedBasePrice === null ? null : computeQuoteTotal({ discount: row.discount, quotedBasePrice }),
  };
}

async function getLinkedJobsByQuoteId({
  db,
  quoteIds,
}: {
  db: Db | DatabaseTransaction;
  quoteIds: readonly UUID[];
}): Promise<Map<UUID, QuoteLinkedJobRow[]>> {
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
    .where(inArray(jobs.quoteId, quoteIds))
    .orderBy(asc(jobs.code), asc(jobs.id));
  const byQuoteId = new Map<UUID, QuoteLinkedJobRow[]>();

  for (const row of rows) {
    if (!row.quoteId) continue;

    const group = byQuoteId.get(row.quoteId) ?? [];
    group.push(row);
    byQuoteId.set(row.quoteId, group);
  }

  return byQuoteId;
}

async function transitionQuote({
  actorUserId,
  db,
  id,
  nextStatus,
  transition,
}: {
  actorUserId: AuthId;
  db: Db;
  id: UUID;
  nextStatus: QuoteStatus;
  transition: 'send' | 'accept' | 'reject';
}): Promise<QuoteDetail> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, id)).for('update');

    if (!before) {
      throw new QuoteNotFoundError(id);
    }

    const result = evaluateQuoteTransition({ from: before.status, transition });
    if (!result.allowed) {
      throw new QuoteTransitionDeniedError(result.reason);
    }

    const values: Partial<QuoteRow> = {
      status: nextStatus,
      updatedAt: new Date(),
    };

    if (transition === 'send') {
      assertCompleteDraft(before);
      const product = await readProductForQuote({ productId: before.productId, tx });
      assertValidDiscount({ basePrice: product.basePrice, discount: before.discount });
      values.quotedBasePrice = product.basePrice;
      values.quotedCurrencyCode = product.currencyCode;
      values.sentAt = new Date();
    }

    const [row] = await tx.update(quotes).set(values).where(eq(quotes.id, id)).returning();

    if (!row) {
      throw new QuoteNotFoundError(id);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after: mapQuoteAuditRecord(row),
        before: mapQuoteAuditRecord(before),
        changes: createAuditChanges(mapQuoteAuditRecord(before), mapQuoteAuditRecord(row), quoteAuditDescriptor.fields),
        entityId: row.id,
        entityType: quoteAuditDescriptor.entityType,
      },
    });

    return getQuote({ db: tx, id: row.id });
  });
}

function assertCompleteDraft(quote: QuoteRow): asserts quote is QuoteRow & {
  productId: UUID;
  salesPersonId: AuthId;
  validUntil: string;
} {
  if (!quote.customerId || !quote.productId || !quote.salesPersonId || !quote.validUntil) {
    throw new QuoteTransitionDeniedError('Quote is missing required fields.');
  }
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

  await insertAuditEvent({
    db: tx,
    input: {
      action: 'created',
      actorUserId,
      after: customer,
      before: null,
      changes: null,
      entityId: customer.id,
      entityType: customerAuditDescriptor.entityType,
    },
  });

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

async function readProductForQuote({
  productId,
  tx,
}: {
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<ProductRow> {
  const [product] = await tx.select().from(products).where(eq(products.id, productId));

  if (!product) {
    throw new QuoteTransitionDeniedError('Quote product was not found.');
  }

  return product;
}

function assertValidDiscount({ basePrice, discount }: { basePrice: number; discount: number }): void {
  const result = validateDiscount({ basePrice, discount });

  if (!result.allowed) {
    throw new QuoteDiscountInvalidError(result.reason);
  }
}

function assertDraftWithoutProductHasNoDiscount(discount: number): void {
  if (discount !== 0) {
    throw new QuoteDiscountInvalidError('Quote discount requires a product.');
  }
}

function mapQuoteAuditRecord(quote: QuoteAuditRecord): QuoteAuditRecord {
  return {
    code: quote.code,
    customerId: quote.customerId,
    discount: quote.discount,
    notes: quote.notes,
    productId: quote.productId,
    quotedBasePrice: quote.quotedBasePrice,
    quotedCurrencyCode: quote.quotedCurrencyCode,
    salesPersonId: quote.salesPersonId,
    sentAt: quote.sentAt,
    status: quote.status,
    validUntil: quote.validUntil,
  };
}

function buildQuoteListWhere(input: QuoteListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.statuses.length > 0) {
    conditions.push(inArray(quotes.status, input.filters.statuses));
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
  const total = sql`coalesce(${quotes.quotedBasePrice}, ${products.basePrice}) - ${quotes.discount}`;
  const columns = {
    code: sql`${quotes.code}`,
    createdAt: sql`${quotes.createdAt}`,
    customerCompanyName: sql`${customers.companyName}`,
    productName: sql`${products.name}`,
    status: sql`${quotes.status}`,
    total,
  } as const satisfies Record<QuoteSortBy, SQL>;

  return columns[sortBy];
}

function parseQuoteCodeSearch(search: string): number | undefined {
  const normalized = search.trim().replace(/^QUO-/i, '');

  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const code = Number.parseInt(normalized, 10);

  return Number.isSafeInteger(code) && code > 0 ? code : undefined;
}
