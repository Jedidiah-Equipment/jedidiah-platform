import type { DocumentOwnerType } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { products } from './product.js';

export const documents = pgTable(
  'documents',
  {
    byteSize: integer('byte_size').notNull(),
    contentType: text('content_type').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    filename: text('filename').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    ownerType: text('owner_type').notNull().$type<DocumentOwnerType>(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    uploaderUserId: text('uploader_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
  },
  (table) => [
    check('documents_byte_size_nonnegative', sql`${table.byteSize} >= 0`),
    check('documents_content_type_nonempty', sql`length(trim(${table.contentType})) > 0`),
    check('documents_filename_nonempty', sql`length(trim(${table.filename})) > 0`),
    check('documents_exactly_one_owner', sql`${table.ownerType} = 'product' AND ${table.productId} IS NOT NULL`),
    index('documents_product_id_created_at_idx').on(table.productId, table.createdAt),
    uniqueIndex('documents_storage_key_unique').on(table.storageKey),
    uniqueIndex('documents_product_id_filename_ci_unique').on(table.productId, sql`lower(${table.filename})`),
  ],
);

export const documentsRelations = relations(documents, ({ one }) => ({
  product: one(products, {
    fields: [documents.productId],
    references: [products.id],
  }),
  uploader: one(user, {
    fields: [documents.uploaderUserId],
    references: [user.id],
  }),
}));
