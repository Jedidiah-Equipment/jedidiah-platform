import { relations, sql } from 'drizzle-orm';
import { check, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { productDepartmentConfigs, products } from './product.js';

export const productOptions = pgTable(
  'product_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    price: numeric('price', { mode: 'number', precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('product_options_price_nonnegative', sql`${table.price} >= 0`),
    uniqueIndex('product_options_active_product_id_code_unique')
      .on(table.productId, table.code)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const productsRelations = relations(products, ({ many }) => ({
  departmentConfigs: many(productDepartmentConfigs),
  options: many(productOptions),
}));

export const productOptionsRelations = relations(productOptions, ({ one }) => ({
  product: one(products, {
    fields: [productOptions.productId],
    references: [products.id],
  }),
}));

export const productDepartmentConfigsRelations = relations(productDepartmentConfigs, ({ one }) => ({
  product: one(products, {
    fields: [productDepartmentConfigs.productId],
    references: [products.id],
  }),
}));
