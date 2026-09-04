import type {
  DocumentMetadata,
  DocumentOwnerType,
  InvoiceFlagResolutionKind,
  SupplierInvoiceExtraction,
} from '@pkg/schema/equipment';
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, jsonb, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from '../auth.js';
import { jobs } from './job.js';
import { equipmentSchema } from './pg-schema.js';
import { products } from './product.js';
import { purchaseOrders } from './purchase-order.js';
import { quotes } from './quote.js';
import { stockMovements } from './stock-movement.js';

export const documents = equipmentSchema.table(
  'documents',
  {
    byteSize: integer('byte_size').notNull(),
    contentType: text('content_type').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    filename: text('filename').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').notNull().$type<DocumentMetadata>(),
    ownerType: text('owner_type').notNull().$type<DocumentOwnerType>(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'cascade' }),
    sourceProductId: uuid('source_product_id').references(() => products.id, { onDelete: 'restrict' }),
    storageKey: text('storage_key').notNull(),
    uploaderUserId: text('uploader_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
  },
  (table) => [
    check('documents_byte_size_nonnegative', sql`${table.byteSize} >= 0`),
    check('documents_content_type_nonempty', sql`length(trim(${table.contentType})) > 0`),
    check('documents_filename_nonempty', sql`length(trim(${table.filename})) > 0`),
    check(
      'documents_exactly_one_owner',
      sql`(${table.ownerType} = 'product' AND ${table.productId} IS NOT NULL AND ${table.jobId} IS NULL AND ${table.quoteId} IS NULL AND ${table.purchaseOrderId} IS NULL) OR (${table.ownerType} = 'job' AND ${table.jobId} IS NOT NULL AND ${table.productId} IS NULL AND ${table.quoteId} IS NULL AND ${table.purchaseOrderId} IS NULL) OR (${table.ownerType} = 'quote' AND ${table.quoteId} IS NOT NULL AND ${table.productId} IS NULL AND ${table.jobId} IS NULL AND ${table.purchaseOrderId} IS NULL) OR (${table.ownerType} = 'purchase_order' AND ${table.purchaseOrderId} IS NOT NULL AND ${table.productId} IS NULL AND ${table.jobId} IS NULL AND ${table.quoteId} IS NULL)`,
    ),
    check(
      'documents_product_rows_have_no_source',
      sql`${table.ownerType} <> 'product' OR ${table.sourceProductId} IS NULL`,
    ),
    check(
      'documents_quote_rows_have_no_source',
      sql`${table.ownerType} <> 'quote' OR ${table.sourceProductId} IS NULL`,
    ),
    check(
      'documents_purchase_order_rows_have_no_source',
      sql`${table.ownerType} <> 'purchase_order' OR ${table.sourceProductId} IS NULL`,
    ),
    index('documents_job_id_created_at_idx').on(table.jobId, table.createdAt),
    index('documents_product_id_created_at_idx').on(table.productId, table.createdAt),
    index('documents_purchase_order_id_created_at_idx').on(table.purchaseOrderId, table.createdAt),
    index('documents_quote_id_created_at_idx').on(table.quoteId, table.createdAt),
    uniqueIndex('documents_job_id_filename_ci_unique').on(table.jobId, sql`lower(${table.filename})`),
    uniqueIndex('documents_product_id_filename_ci_unique').on(table.productId, sql`lower(${table.filename})`),
    uniqueIndex('documents_purchase_order_id_filename_ci_unique').on(
      table.purchaseOrderId,
      sql`lower(${table.filename})`,
    ),
    uniqueIndex('documents_quote_id_filename_ci_unique').on(table.quoteId, sql`lower(${table.filename})`),
  ],
);

/**
 * Which `return-to-supplier` movements a credit-note document settles (spec §4).
 *
 * The reference lives beside the document rather than on the movement because ledger rows are
 * immutable — "this has been credited" is a fact about the paper that arrived later, not about the
 * stock that left. A return takes at most one credit note: the supplier credits the original
 * invoice one-to-one, and the returns-awaiting-credit signal keys on the absence of a row here.
 */
export const creditNoteSettlements = equipmentSchema.table(
  'credit_note_settlement',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    stockMovementId: uuid('stock_movement_id')
      .notNull()
      .references(() => stockMovements.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.stockMovementId], name: 'credit_note_settlement_pkey' }),
    uniqueIndex('credit_note_settlement_stock_movement_unique').on(table.stockMovementId),
  ],
);

/**
 * One AI read of one supplier-invoice document (spec §5).
 *
 * The extraction is stored; the *match* against the order's lines never is. Amendments change those
 * lines after the invoice was filed (#1055), so a stored match would keep flagging a price somebody
 * has since agreed — the panel recomputes it on every read instead.
 *
 * A null `extraction` is the explicit failure contract: the read was attempted and came back
 * unusable, which the panel reports as "couldn't read this invoice". That is deliberately different
 * from having no row at all, and it is why the row is written whether or not the model succeeded.
 * The document id is the key because the read is re-runnable — a second attempt replaces the first.
 */
export const invoiceExtractions = equipmentSchema.table('invoice_extraction', {
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  documentId: uuid('document_id')
    .primaryKey()
    .references(() => documents.id, { onDelete: 'cascade' }),
  extraction: jsonb('extraction').$type<SupplierInvoiceExtraction>(),
});

/**
 * What a human did about one flagged line: applied the invoiced price, or dismissed the flag.
 *
 * Both persist for the same reason — the panel is rebuilt from scratch on every visit, so without
 * this a dismissal would reappear tomorrow and an applied correction would keep asking to be
 * applied again. `flagKey` is the flag's own stable identity (`@pkg/schema`'s `invoiceFlagKey`),
 * keyed on the Part for a line-level flag and on the invoice line's position for the rest.
 */
export const invoiceFlagResolutions = equipmentSchema.table(
  'invoice_flag_resolution',
  {
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    flagKey: text('flag_key').notNull(),
    kind: text('kind').notNull().$type<InvoiceFlagResolutionKind>(),
    // The revaluation the apply posted — the ledger row is where "who corrected this, and to what"
    // actually lives, and this is the reference back to it.
    stockMovementId: uuid('stock_movement_id').references(() => stockMovements.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.flagKey], name: 'invoice_flag_resolution_pkey' }),
    check('invoice_flag_resolution_flag_key_nonempty', sql`length(trim(${table.flagKey})) > 0`),
    check('invoice_flag_resolution_kind_check', sql`${table.kind} IN ('applied', 'dismissed')`),
    // An apply that posted nothing would be a correction nobody can trace, and a dismissal that
    // named a movement would claim the ledger was written when it was not.
    check(
      'invoice_flag_resolution_shape',
      sql`(${table.kind} = 'applied' AND ${table.stockMovementId} IS NOT NULL) OR (${table.kind} = 'dismissed' AND ${table.stockMovementId} IS NULL)`,
    ),
  ],
);

export const invoiceExtractionRelations = relations(invoiceExtractions, ({ one }) => ({
  document: one(documents, {
    fields: [invoiceExtractions.documentId],
    references: [documents.id],
  }),
}));

export const invoiceFlagResolutionRelations = relations(invoiceFlagResolutions, ({ one }) => ({
  actor: one(user, {
    fields: [invoiceFlagResolutions.actorUserId],
    references: [user.id],
  }),
  document: one(documents, {
    fields: [invoiceFlagResolutions.documentId],
    references: [documents.id],
  }),
  stockMovement: one(stockMovements, {
    fields: [invoiceFlagResolutions.stockMovementId],
    references: [stockMovements.id],
  }),
}));

export const creditNoteSettlementRelations = relations(creditNoteSettlements, ({ one }) => ({
  document: one(documents, {
    fields: [creditNoteSettlements.documentId],
    references: [documents.id],
  }),
  stockMovement: one(stockMovements, {
    fields: [creditNoteSettlements.stockMovementId],
    references: [stockMovements.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  job: one(jobs, {
    fields: [documents.jobId],
    references: [jobs.id],
  }),
  product: one(products, {
    fields: [documents.productId],
    relationName: 'documentProductOwner',
    references: [products.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [documents.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  quote: one(quotes, {
    fields: [documents.quoteId],
    references: [quotes.id],
  }),
  sourceProduct: one(products, {
    fields: [documents.sourceProductId],
    relationName: 'documentSourceProduct',
    references: [products.id],
  }),
  uploader: one(user, {
    fields: [documents.uploaderUserId],
    references: [user.id],
  }),
}));
