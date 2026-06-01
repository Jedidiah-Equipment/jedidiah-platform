import type { DocumentOwnerType } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { jobs } from './job.js';
import { products } from './product.js';

export const documents = pgTable(
  'documents',
  {
    byteSize: integer('byte_size').notNull(),
    contentType: text('content_type').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    filename: text('filename').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    ownerType: text('owner_type').notNull().$type<DocumentOwnerType>(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
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
      sql`(${table.ownerType} = 'product' AND ${table.productId} IS NOT NULL AND ${table.jobId} IS NULL) OR (${table.ownerType} = 'job' AND ${table.jobId} IS NOT NULL AND ${table.productId} IS NULL)`,
    ),
    check(
      'documents_product_rows_have_no_source',
      sql`${table.ownerType} <> 'product' OR ${table.sourceProductId} IS NULL`,
    ),
    index('documents_job_id_created_at_idx').on(table.jobId, table.createdAt),
    index('documents_product_id_created_at_idx').on(table.productId, table.createdAt),
    uniqueIndex('documents_job_id_filename_ci_unique').on(table.jobId, sql`lower(${table.filename})`),
    uniqueIndex('documents_product_id_filename_ci_unique').on(table.productId, sql`lower(${table.filename})`),
  ],
);

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
