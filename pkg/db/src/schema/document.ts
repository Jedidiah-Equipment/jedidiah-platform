import type { DocumentMetadata, DocumentOwnerType } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { jobs } from './job.js';
import { products } from './product.js';
import { purchaseOrders } from './purchase-order.js';
import { quotes } from './quote.js';
import { stockMovements } from './stock-movement.js';

export const documents = pgTable(
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
export const creditNoteSettlements = pgTable(
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
