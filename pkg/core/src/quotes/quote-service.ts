import { randomUUID } from 'node:crypto';

import {
  createGlobalSearchCondition,
  customers,
  type DatabaseTransaction,
  type Db,
  documents,
  getSortOrder,
  getUniqueViolationConstraint,
  jobs,
  products,
  quoteSelectedAssemblies,
  quotes,
  user,
  withPagination,
} from '@pkg/db';
import { assertQuoteEditable, parseJobCodeSearch, validateDiscount, validateDocumentMetadata } from '@pkg/domain';
import {
  type Assembly,
  type AuthId,
  JobCode,
  ProductCurrencyCode,
  Quote,
  type QuoteCreateInput,
  type QuoteDetail,
  type QuoteDocument,
  QuoteDocumentMetadata,
  QuoteDocument as QuoteDocumentSchema,
  type QuoteListInput,
  type QuoteListResult,
  type QuoteSortBy,
  type QuoteSummary,
  type QuoteUpdateInput,
  type UserListResult,
  UserSummary,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';

import {
  createAuditChanges,
  createAuditSnapshotChanges,
  customerAuditDescriptor,
  insertAuditEvent,
  quoteAuditDescriptor,
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
  documentBaseSelect,
  mapDocumentSummary,
  type ReadDocumentResult,
  sanitizeDocumentStorageKeySuffix,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { listAssemblies } from '../products/product-assembly-service.js';
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

const QUOTE_DOCUMENT_FILENAME_UNIQUE_INDEX = 'documents_quote_id_filename_ci_unique';

type QuoteRow = typeof quotes.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type QuoteAuditRecord = Pick<
  QuoteRow,
  | 'code'
  | 'customerId'
  | 'depositPercent'
  | 'deliveryIncluded'
  | 'deliveryPrice'
  | 'discountAmount'
  | 'notes'
  | 'documentNotes'
  | 'plannedDeliveryDate'
  | 'preferredDeliveryDate'
  | 'productId'
  | 'quotedBasePrice'
  | 'quotedCurrencyCode'
  | 'salesPersonId'
  | 'status'
  | 'validUntil'
> & {
  selectedAssemblies: string;
};
type QuoteListRow = {
  quote: QuoteRow;
  customerCompanyName: string;
  productCurrencyCode: string;
  productModelCode: string;
  productName: string;
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
  product: Pick<typeof products.$inferSelect, 'currencyCode' | 'modelCode' | 'name'>;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'name'> | null;
  selectedAssemblies: QuoteSelectedAssemblyRow[];
};
export type QuoteDocumentCreateInput = {
  bytes: Uint8Array;
  filename: string;
  metadata: unknown;
  quoteId: UUID;
};

export function mapQuote(row: QuoteRow): Quote {
  return Quote.parse({
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    customerId: row.customerId,
    depositPercent: row.depositPercent,
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountAmount: row.discountAmount,
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
    const product = await readProductForQuote({ productId: input.productId, tx });
    assertValidDiscount({ basePrice: product.basePrice, discountAmount: input.discountAmount });
    await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });

    const [row] = await tx
      .insert(quotes)
      .values({
        customerId,
        depositPercent: input.depositPercent,
        deliveryIncluded: input.deliveryIncluded,
        deliveryPrice: input.deliveryIncluded ? input.deliveryPrice : 0,
        discountAmount: input.discountAmount,
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

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'created',
        actorUserId,
        after: mapQuoteAuditRecord(row, selectedAssemblies),
        before: null,
        changes: createAuditSnapshotChanges(
          mapQuoteAuditRecord(row, selectedAssemblies),
          quoteAuditDescriptor.fields,
          'created',
        ),
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
        productCurrencyCode: products.currencyCode,
        productModelCode: products.modelCode,
        productName: products.name,
        salesPersonEmail: user.email,
        salesPersonName: user.name,
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
  const [selectedAssembliesByQuoteId, linkedJobsByQuoteId] = await Promise.all([
    getSelectedAssembliesByQuoteId({ db, quoteIds }),
    getLinkedJobsByQuoteId({ db, quoteIds }),
  ]);

  return {
    items: rows.map((row) =>
      mapQuoteSummary(
        row,
        linkedJobsByQuoteId.get(row.quote.id) ?? [],
        selectedAssembliesByQuoteId.get(row.quote.id) ?? [],
      ),
    ),
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
      selectedAssemblies: {
        orderBy: [asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id)],
      },
    },
  });

  if (!row) {
    throw new QuoteNotFoundError(id);
  }

  const assemblies = await listAssemblies({ tx: db, productId: row.productId });

  return mapQuoteDetail(row, assemblies);
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
        thumbnailDataUrl: row.image,
      }),
    ),
  };
}

export async function getQuoteDocuments({ db, quoteId }: { db: Db; quoteId: UUID }): Promise<QuoteDocument[]> {
  await assertQuoteExists({ db, quoteId });

  const rows = await selectQuoteDocumentSummary(db)
    .where(eq(documents.quoteId, quoteId))
    .orderBy(sql`${documents.createdAt} desc`, sql`${documents.id} desc`);

  return rows.map(mapQuoteDocumentSummary);
}

export async function createQuoteDocument({
  actorUserId,
  db,
  input,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteDocumentCreateInput;
  storage: StorageAdapter;
}): Promise<QuoteDocument> {
  await assertQuoteExists({ db, quoteId: input.quoteId });
  const metadata = parseQuoteDocumentMetadata(input.metadata);
  const row = await createDocumentRecord({
    actorUserId,
    db,
    input: {
      bytes: input.bytes,
      filename: input.filename,
      metadata,
      ownerType: 'quote',
      quoteId: input.quoteId,
      storageKey: createQuoteDocumentStorageKey({
        filename: input.filename,
        quoteId: input.quoteId,
      }),
    },
    mapInsertError: (error) =>
      mapQuoteDocumentUniqueViolation(error, {
        filename: input.filename,
        quoteId: input.quoteId,
      }),
    storage,
  });

  return getQuoteDocumentSummary({ db, documentId: row.id, quoteId: input.quoteId });
}

export async function readQuoteDocument({
  db,
  documentId,
  quoteId,
  storage,
}: {
  db: Db;
  documentId: UUID;
  quoteId: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  await assertQuoteExists({ db, quoteId });
  const document = await getQuoteDocumentSummaryRow({ db, documentId, quoteId });

  return {
    document: mapDocumentSummary(document),
    object: await storage.get(document.storageKey),
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

    assertValidDiscount({ basePrice: before.quotedBasePrice, discountAmount: input.discountAmount });

    await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });

    const patch = {
      customerId: before.customerId,
      depositPercent: input.depositPercent,
      deliveryIncluded: input.deliveryIncluded,
      deliveryPrice: input.deliveryIncluded ? input.deliveryPrice : 0,
      discountAmount: input.discountAmount,
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
    const changes = createAuditChanges(
      mapQuoteAuditRecord(before, beforeSelectedAssemblies),
      mapQuoteAuditRecord(after, resolved.rows),
      quoteAuditDescriptor.fields,
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
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(quotes.id, input.id))
      .returning();

    if (!row) {
      throw new QuoteNotFoundError(input.id);
    }

    const selectedAssemblies = await persistQuoteSelectedAssemblies({ quoteId: row.id, resolved, tx });

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after: mapQuoteAuditRecord(row, selectedAssemblies),
        before: mapQuoteAuditRecord(before, beforeSelectedAssemblies),
        changes,
        entityId: row.id,
        entityType: quoteAuditDescriptor.entityType,
      },
    });

    return getQuote({ db: tx, id: row.id });
  });
}

function mapQuoteSummary(
  row: QuoteListRow,
  linkedJobs: readonly QuoteLinkedJobRow[],
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): QuoteSummary {
  return {
    ...mapQuote(row.quote),
    customerCompanyName: row.customerCompanyName,
    linkedJobs: linkedJobs.map((job) => ({
      jobCode: JobCode.parse(job.jobCode),
      jobId: job.jobId,
    })),
    productCurrencyCode: ProductCurrencyCode.parse(row.productCurrencyCode),
    productModelCode: row.productModelCode,
    productName: row.productName,
    salesPersonEmail: row.salesPersonEmail,
    salesPersonName: row.salesPersonName,
    selectedAssemblies: selectedAssemblies.map(mapQuoteSelectedAssembly),
  };
}

function mapQuoteDetail(row: QuoteDetailRow, productAssembliesForQuote: Assembly[]): QuoteDetail {
  return {
    ...mapQuote(row),
    customerCompanyName: row.customer.companyName,
    linkedJobs: row.jobs.map((job) => ({
      jobCode: JobCode.parse(job.code),
      jobId: job.id,
    })),
    productCurrencyCode: ProductCurrencyCode.parse(row.product.currencyCode),
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    productAssemblies: productAssembliesForQuote,
    salesPersonEmail: row.salesPerson?.email ?? null,
    salesPersonName: row.salesPerson?.name ?? null,
    selectedAssemblies: row.selectedAssemblies.map(mapQuoteSelectedAssembly),
  };
}

function parseQuoteDocumentMetadata(metadata: unknown): QuoteDocumentMetadata {
  const result = validateDocumentMetadata({ metadata, ownerType: 'quote' });

  if (!result.ok) {
    throw new DocumentPolicyViolationError(result);
  }

  return QuoteDocumentMetadata.parse(metadata);
}

function selectQuoteDocumentSummary(db: Db) {
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

async function getQuoteDocumentSummary({
  db,
  documentId,
  quoteId,
}: {
  db: Db;
  documentId: UUID;
  quoteId: UUID;
}): Promise<QuoteDocument> {
  return mapQuoteDocumentSummary(await getQuoteDocumentSummaryRow({ db, documentId, quoteId }));
}

function mapQuoteDocumentSummary(row: DocumentSummaryRow): QuoteDocument {
  return QuoteDocumentSchema.parse(mapDocumentSummary(row));
}

async function getQuoteDocumentSummaryRow({
  db,
  documentId,
  quoteId,
}: {
  db: Db;
  documentId: UUID;
  quoteId: UUID;
}): Promise<DocumentSummaryRow> {
  const [row] = await selectQuoteDocumentSummary(db)
    .where(and(eq(documents.quoteId, quoteId), eq(documents.id, documentId)))
    .limit(1);

  if (!row) {
    throw new DocumentNotFoundError(documentId);
  }

  return row;
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
      changes: createAuditSnapshotChanges(customer, customerAuditDescriptor.fields, 'created'),
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

async function assertQuoteExists({ db, quoteId }: { db: Db; quoteId: UUID }): Promise<void> {
  const [quote] = await db
    .select({
      id: quotes.id,
    })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);

  if (!quote) {
    throw new QuoteNotFoundError(quoteId);
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
    throw new QuoteInvalidReferenceError('Quote product was not found.');
  }

  return product;
}

function assertValidDiscount({ basePrice, discountAmount }: { basePrice: number; discountAmount: number }): void {
  const result = validateDiscount({ basePrice, discountAmount });

  if (!result.allowed) {
    throw new QuoteDiscountInvalidError(result.reason);
  }
}

function mapQuoteAuditRecord(
  quote: Omit<QuoteAuditRecord, 'selectedAssemblies'>,
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): QuoteAuditRecord {
  return {
    code: quote.code,
    customerId: quote.customerId,
    depositPercent: quote.depositPercent,
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountAmount: quote.discountAmount,
    notes: quote.notes,
    documentNotes: quote.documentNotes,
    plannedDeliveryDate: quote.plannedDeliveryDate,
    preferredDeliveryDate: quote.preferredDeliveryDate,
    productId: quote.productId,
    quotedBasePrice: quote.quotedBasePrice,
    quotedCurrencyCode: quote.quotedCurrencyCode,
    salesPersonId: quote.salesPersonId,
    selectedAssemblies: JSON.stringify(toQuoteSelectedAssemblyAuditRecord(selectedAssemblies)),
    status: quote.status,
    validUntil: quote.validUntil,
  };
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

function parseQuoteCodeSearch(search: string): number | undefined {
  const normalized = search.trim().replace(/^QUO-/i, '');

  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const code = Number.parseInt(normalized, 10);

  return Number.isSafeInteger(code) && code > 0 ? code : undefined;
}

function createQuoteDocumentStorageKey(input: { filename: string; quoteId: UUID }): string {
  return `documents/quote/${input.quoteId}/${randomUUID()}-${sanitizeDocumentStorageKeySuffix(input.filename)}`;
}

function mapQuoteDocumentUniqueViolation(error: unknown, input: { filename: string; quoteId: UUID }): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint?.includes(QUOTE_DOCUMENT_FILENAME_UNIQUE_INDEX) || isQuoteDocumentFilenameUniqueDetail(error)) {
    return new DuplicateDocumentFilenameError({
      filename: input.filename,
      ownerId: input.quoteId,
      ownerType: 'quote',
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isQuoteDocumentFilenameUniqueDetail(error: unknown): boolean {
  const text = collectDocumentErrorText(error).join('\n');

  return text.includes('documents') && text.includes('quote_id') && text.includes('lower(filename)');
}
